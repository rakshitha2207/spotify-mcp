# Spotify MCP Server

A Node.js-based server that integrates with the Spotify Web API and the Model Context Protocol (MCP) to provide tools for searching, controlling playback, and managing Spotify content. It allows users to interact with their Spotify account programmatically via a standardized MCP interface over stdio transport.

---

## 🧠 Project Overview

**Name:** Spotify MCP Server  
**Description:** A programmable interface that connects Spotify Web API with the MCP standard, enabling search, playback control, and playlist management using JSON-based tools over stdio.  
**Key Features:**
- 🔍 Search for tracks on Spotify
- 🎵 Check current playback state
- ▶️ Play specific tracks by URI
- 📋 Retrieve user playlists
- ⏸ Pause ongoing playback
- 🔐 OAuth authentication with Spotify
- 📉 Rate limit handling for Spotify API requests

---

## ⚙️ Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- A [Spotify Developer Account](https://developer.spotify.com/dashboard) with app credentials
- npm (Node Package Manager)

---

## 📦 Installation Steps

```bash
# 1. Clone the repository
git clone <repository-url>
cd spotify-mcp

# 2. Install dependencies
npm install

# 3. Create a .env file and add the following:
```

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:8888/callback
```

> **Note:** Replace `your_spotify_client_id` and `your_spotify_client_secret` with your Spotify Developer app credentials. The redirect URI must match the one set in your Spotify app settings.

```bash
# 4. Build
npm run build
# 5. Run the server
npm start
```
> This will open a browser for Spotify authentication and start the server using stdio transport.

---

## 🔧 Tools

### 1. `search_tracks`
- **Description:** Search for tracks on Spotify based on a query string.
- **Input Schema:**
  - `query` (string, required): Search term (e.g., artist name, song title).
- **Output:** JSON array of up to 5 track objects with `name`, `artist`, `album`, `release_date`, `popularity`, `id`, and `uri`.
- **Example:**
```json
{
  "name": "search_tracks",
  "arguments": {"query": "The Beatles"}
}
```

### 2. `get_playback_state`
- **Description:** Retrieve the current playback state of the user's Spotify account.
- **Input Schema:** None
- **Output:** JSON object with current track info, playback status, and device details, or "No active playback" if nothing is playing.
- **Example:**
```json
{
  "name": "get_playback_state",
  "arguments": {}
}
```

### 3. `play_track`
- **Description:** Play a specific track using its Spotify URI.
- **Input Schema:**
  - `uri` (string, required): Spotify track URI (e.g., `spotify:track:xxx`).
- **Output:** JSON confirmation with `status` and `uri`.
- **Example:**
```json
{
  "name": "play_track",
  "arguments": {"uri": "spotify:track:7KXjTSCq5nL1LoYtL7XAwS"}
}
```

### 4. `get_user_playlists`
- **Description:** Fetch the user's playlists from Spotify.
- **Input Schema:**
  - `limit` (number, optional): Maximum number of playlists to return (default: 20).
- **Output:** JSON array of playlist objects with `name`, `id`, `track_count`, `uri`, and `public` status.
- **Example:**
```json
{
  "name": "get_user_playlists",
  "arguments": {"limit": 10}
}
```

### 5. `pause_playback`
- **Description:** Pause the current playback on the user's active Spotify device.
- **Input Schema:** None
- **Output:** JSON confirmation with "Playback paused" status.
- **Example:**
```json
{
  "name": "pause_playback",
  "arguments": {}
}
```

---

## 🌐 Use Cases

1. **Music Discovery Bot:**
   - Use `search_tracks` and `play_track` to implement mood-based music chatbots.

2. **Playlist Management Tool:**
   - Use `get_user_playlists` and `search_tracks` to preview and organize playlists.

3. **Playback Control Automation:**
   - Automate playback actions using `get_playback_state`, `play_track`, and `pause_playback`.

4. **Spotify Dashboard:**
   - Build a desktop widget using `get_playback_state`, `get_user_playlists`, `pause_playback`, and `play_track`.

5. **Learning Spotify API:**
   - Experiment with all tools to learn how the Spotify Web API works.

---

## 🔐 Authentication Details

- On first run, the server opens a browser for Spotify OAuth authentication.
- Receives code via `http://localhost:8888/callback`.
- Exchanges the code for access and refresh tokens.
- Automatically refreshes tokens within 5 minutes of expiration.

---

## ⏱ Rate Limiting

- Handles Spotify API rate limits with retry strategies:
  - 10-second cooldown after each request.
  - 1-minute wait if a 429 Too Many Requests error occurs.

---

## 📊 Dependencies

```bash
npm install dotenv spotify-web-api-node @modelcontextprotocol/sdk open
```

- `dotenv`: Loads environment variables from `.env`.
- `spotify-web-api-node`: Spotify API client.
- `@modelcontextprotocol/sdk`: Implements the MCP server.
- `http`, `url`: Node.js built-ins for OAuth redirect server.
- `open`: Opens default browser for authentication.

---

## 📁 Development Info

- **Entry Point:** `index.js`
- **Language:** JavaScript (Node.js with ES modules)
- **Run Command:** `node index.js`
- **Debugging:** Check console logs for MCP or authentication errors.

---

## ⚠️ Limitations

- Spotify Premium is required for playback control.
- Supports only stdio transport (no HTTP, WebSocket, etc.).
- `search_tracks` returns max 5 results.
- Assumes a single active device for playback.

---

## 🚀 Contributing

Feel free to open issues or submit pull requests to:
- Add new tools
- Enhance existing functionality
- Improve documentation

---

## ✍️ License

MIT License — free to use, modify, and distribute for personal or commercial use.

---

## ❤️ Footer

Built with ❤️ by Rakshitha C Devadiga on March 17, 2025

