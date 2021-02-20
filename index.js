const open = require("open");
const cryptoRandomString = require("crypto-random-string");
const crypto = require("crypto");
const express = require("express");
const axios = require("axios");
const base64url = require("base64url");

module.exports = class {
	constructor(clientId, scopes, port) {
		this.clientId = clientId;
		this.port = port;
		this.scopes = scopes;
	}

	//Authentication

	async initialize() {
		const randomString = cryptoRandomString({ length: 100 });
		const hash = crypto
			.createHash("sha256")
			.update(randomString)
			.digest("base64");
		const code_challenge = base64url.fromBase64(hash);
		const code = await this.getCode(code_challenge);
		const tokenResponse = await this.getToken(code, randomString);

		this.spotifyInstance = axios.create({
			baseURL: "https://api.spotify.com/v1/",
			timeout: 5000,
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
		});

		this.handleToken(tokenResponse);
	}

	async getToken(code, verifier) {
		const params = new URLSearchParams();
		params.append("client_id", this.clientId);
		params.append("grant_type", "authorization_code");
		params.append("code", code);
		params.append(
			"redirect_uri",
			`http://localhost:${this.port}/callback/`
		);
		params.append("code_verifier", verifier);

		const response = await axios.post(
			"https://accounts.spotify.com/api/token",
			params,
			{
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
			}
		);

		return response.data;
	}

	handleToken(tokenResponse) {
		this.accessToken = tokenResponse["access_token"];
		this.spotifyInstance.defaults.headers.common[
			"Authorization"
		] = `Bearer ${this.accessToken}`;
		this.rToken = tokenResponse["refresh_token"];

		setTimeout(
			this.refreshToken.bind(this),
			(tokenResponse["expires_in"] - 120) * 1000
		);
	}

	async refreshToken(failures = 0) {
		try {
			const params = new URLSearchParams();
			params.append("client_id", this.clientId);
			params.append("grant_type", "refresh_token");
			params.append("refresh_token", this.rToken);

			const response = await axios.post(
				"https://accounts.spotify.com/api/token",
				params,
				{
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
				}
			);

			this.handleToken(response.data);
		} catch (error) {
			if (failures > 3) throw error;
			else setTimeout(this.refreshToken.bind(this, failures + 1), 2000);
		}
	}

	buildAuthorizationURI(hash) {
		const url = new URL("https://accounts.spotify.com/authorize");

		url.searchParams.append("response_type", "code");
		url.searchParams.append("client_id", this.clientId);
		url.searchParams.append(
			"redirect_uri",
			`http://localhost:${this.port}/callback/`
		);
		url.searchParams.append("scope", this.scopes.join(" "));
		url.searchParams.append("code_challenge", hash);
		url.searchParams.append("code_challenge_method", "S256");

		return url.href;
	}

	getCode(hash) {
		return new Promise((resolve, error) => {
			let server = null;
			const app = express();

			app.get("/callback", (req, res) => {
				server.close();
				if (req.query.code) {
					res.send("Authenticated!");
					resolve(req.query.code);
				} else {
					res.send("Not Authenticated");
					error(req.query.error);
				}
			});

			server = app.listen(this.port, () => {
				open(this.buildAuthorizationURI(hash));
			});
		});
	}

	//API

	async pausePlayback() {
		const response = await this.spotifyInstance.put("me/player/pause");
		return true;
	}

	async resumePlayback(data) {
		const response = await this.spotifyInstance.put("me/player/play", data);
		return true;
	}

	async getPlayerInformation() {
		const response = await this.spotifyInstance.get("me/player");
		return response.data;
	}
};
