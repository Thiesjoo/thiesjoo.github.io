/**
 * Request recent messages from:
 * https://recent-messages.robotty.de/api (From last 10 minutes, parse IRC message)
 * https://tmi.twitch.tv/group/user/<username>/chatters (Get current viewers)
 *
 * Client should subscribe to messages in IRC and add those users to the list. Everything from here will be cached for 60 seconds?
 *
 * Filter out bots, dupes and broadcaster
 */

const BOTLIST = [
	"guanthebot",
	"madestoutbot",
	"cloudlog",
	"discord_for_streamers",
	"soundalerts",
	"streamelements",
	"streamlabs",
	"carbot14xyz",
	"commanderroot",
	"anotherttvviewer",
];

const TypeList = ["mod", "vip", "user"];
type User = { name: string; type: "mod" | "vip" | "user" };

import { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";
import ms from "ms";
import { parse } from "irc-message";

export default async function(req: VercelRequest, res: VercelResponse) {
	if (typeof req.query.user === "object") return;
	if (!req.query.user)
		return res
			.status(400)
			.json({ ok: false, error: "Please add a user in the query parameter" });
	const { user } = req.query;

	const recentReq = async () => {
		const data = (
			await axios(
				`https://recent-messages.robotty.de/api/v2/recent-messages/${user}?limit=100&hide_moderation_messages=true&hide_moderated_messages=true`
			)
		).data;
		return getUsersFromIRC(data);
	};

	const userReq = async () => {
		return combineViewers(
			(await axios(`https://tmi.twitch.tv/group/user/${user}/chatters`)).data
		);
	};

	try {
		const [recentMessages, viewerList] = await Promise.all([
			recentReq(),
			userReq(),
		]);

		res.setHeader("Cache-Control", "max-age=30, stale-while-revalidate=60");
		return res.json({
			message: `Returns (SORTED) users in chat from the past 20 minutes + users in viewerlist - bots`,
			time: Date.now(),
			data: filterBotsAndDuplicates([...recentMessages, ...viewerList], user),
		});
	} catch (e) {
		console.error(e);
		return res.status(500).send({ ok: false, e });
	}
}

/** Combine all viewers from the TMI api with correct type */
function combineViewers(data: {
	chatters: { [key: string]: string[] };
}): User[] {
	return Object.entries(data.chatters)
		.map((chatCategory) => {
			let type = "user";
			if (chatCategory[0] === "moderators") {
				type = "mod";
			} else if (chatCategory[0] === "vips") {
				type = "vip";
			}
			return chatCategory[1].map((chatter) => {
				return {
					name: chatter,
					type,
				};
			}) as User[];
		})
		.reduce((acc, val) => acc.concat(val), []);
}

/**
 * Get all the usernames of the people that chatted within the last maxDate miliseconds
 * @param irc The IRC comment
 * @param maxDate From what date to filter
 * @returns
 */
function getUsersFromIRC(
	irc: { messages: string[] },
	maxDate = +ms("20m")
): User[] {
	const current = Date.now() - maxDate;
	return irc.messages
		.reduce((acc, val) => {
			const parsed = parse(val);
			if (!parsed.tags["rm-received-ts"]) {
				return acc;
			}
			let time = +parsed.tags["rm-received-ts"];
			if (current < time) {
				let type = "user";

				if (parsed.tags.mod === "1") {
					type = "mod";
				} else if (
					typeof parsed.tags.badges === "string" &&
					(parsed.tags.badges as string).startsWith("vip")
				) {
					type = "vip";
				}
				acc.push({ name: parsed.tags["display-name"].toLowerCase(), type });
			}
			return acc;
		}, [])
		.filter((x) => x);
}

/**
 * Filter out the bots, duplicates and the broadcaster.
 */
function filterBotsAndDuplicates(users: User[], broadcaster?: string): User[] {
	const already = new Set();
	if (broadcaster) already.add(broadcaster);
	return users
		.filter((x) => {
			if (
				already.has(x.name) ||
				BOTLIST.includes(x.name) ||
				x.name.endsWith("bot")
			) {
				return false;
			}
			already.add(x.name);
			return true;
		})
		.sort((a, b) => {
			//Sort first based on type, then name
			if (a.type === b.type) {
				return b.name < a.name ? 1 : -1;
			}
			return TypeList.indexOf(a.type) > TypeList.indexOf(b.type) ? 1 : -1;
		});
}
