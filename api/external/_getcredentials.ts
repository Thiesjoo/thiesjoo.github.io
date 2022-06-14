import { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";

export async function getProviderCredentials(req: VercelRequest, res: VercelResponse, provider: string, id?: string) {
	let token = req.cookies.accesstoken || req.headers.authorization?.split(" ")?.[1];
	try {
		if (!token) {
			throw new Error("401 - No accesstoken");
		}

		const result: {
			id: string;
			accessToken: string;
			expiry: Date;
			refreshToken?: string;
			username?: string;
			avatar?: string;
			scopes?: string[];
			extra?: any;
			clientid: string;
		} = (
			await axios({
				url: process.env.BASEURL + "/api/providers/me/" + provider,
				params: {
					id,
				},
				headers: {
					Authorization: `Bearer ${token}`,
					"X-Secret": process.env.secret,
				},
				method: "GET",
			})
		)?.data;
		return result;
	} catch (e) {
		console.error("PROVIDER (myapi): ", e, " msg: " + e?.response?.data?.message, e?.data);
		res.statusCode = e?.message?.includes("401") ? 401 : 404;
		res.json({
			ok: false,
			errorLocation: "getProviderCredentials",
			error: e?.message,
		});

		return false;
	}
}

export default getProviderCredentials;
