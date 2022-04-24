import { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";
import * as ICAL from "node-ical";
import { default as ms } from "ms";

export default async function (req: VercelRequest, res: VercelResponse) {
	const rooster_data = (await axios({ url: " https://datanose.nl/195750.ics" }))
		?.data;

	const parsed = await ICAL.async.parseICS(rooster_data);
	res.setHeader(
		"Cache-Control",
		"max-age=0, s-maxage=" + ((ms("7d") as number) / 1000).toString()
	);

	res.json({
		data: parsed,
	});
}
