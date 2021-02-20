const Spotify = require("./index.js");

const clientId = ""; // add yours to test

(async () => {
	const spotify = new Spotify(
		clientId,
		["user-modify-playback-state", "user-read-playback-state"],
		9000
	);
	await spotify.initialize();
	await spotify.pausePlayback();
	console.log(await spotify.getPlayerInformation());
})();
