#!/usr/bin/env node
import * as dotenv from 'dotenv';
import SpotifyWebApi from 'spotify-web-api-node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import http from 'http';
import url from 'url';
import open from 'open';

// Load environment variables
dotenv.config();

// Spotify API client setup
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID ?? '',
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? '',
  redirectUri: process.env.SPOTIFY_REDIRECT_URI ?? 'http://localhost:8888/callback',
});

// Track rate limit reset times
const rateLimitResets: { [key: string]: number } = {
  'search': 0,
  'playback': 0,
};

// Helper function for rate limit handling
async function withRateLimit<T>(endpoint: 'search' | 'playback', fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const resetTime = rateLimitResets[endpoint];

  if (now < resetTime) {
    const waitTime = resetTime - now + 1000; // Add 1 second buffer
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  try {
    const result = await fn();
    // Spotify's rate limit is typically 180 requests per minute
    rateLimitResets[endpoint] = now + (10 * 1000);
    return result;
  } catch (error: any) {
    if (error.statusCode === 429) {
      // Spotify rate limit exceeded
      rateLimitResets[endpoint] = now + (60 * 1000); // Wait 1 minute before retrying
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Rate limit exceeded for ${endpoint}. Please try again in 1 minute.`
      );
    }
    throw error;
  }
}

// Create server for OAuth callback
async function startAuthServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = url.parse(req.url || '', true);
        
        if (parsedUrl.pathname === '/callback') {
          const { code } = parsedUrl.query;
          
          if (typeof code !== 'string') {
            res.writeHead(400);
            res.end('Missing authorization code');
            return reject(new Error('Missing authorization code'));
          }
          
          res.writeHead(200);
          res.end('Authentication successful! You can close this window.');
          
          server.close();
          resolve(code);
        }
      } catch (error) {
        reject(error);
      }
    });
    
    server.listen(8888, () => {
      console.error('OAuth callback server listening on port 8888');
    });
  });
}

class SpotifyMcpServer {
  private server: Server;
  private spotifyApi: SpotifyWebApi;
  private tokenExpirationTime = 0;

  constructor() {
    this.spotifyApi = spotifyApi;
    this.server = new Server(
      {
        name: 'spotify-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_tracks',
          description: 'Search for tracks on Spotify',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query for tracks (e.g., artist or song name)',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_playback_state',
          description: 'Get the current playback state',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'play_track',
          description: 'Play a specific track by URI',
          inputSchema: {
            type: 'object',
            properties: {
              uri: {
                type: 'string',
                description: 'Spotify URI of the track to play (e.g., spotify:track:xxx)',
              },
            },
            required: ['uri'],
          },
        },
        {
          name: 'get_user_playlists',
          description: 'Get the current user\'s playlists',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of playlists to return (default: 20)',
                default: 20,
              },
            },
          },
        },
        {
          name: 'pause_playback',
          description: 'Pause the current playback',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        // Ensure valid access token before proceeding
        await this.ensureValidToken();

        switch (request.params.name) {
          case 'search_tracks': {
            const { query } = request.params.arguments as { query: string };

            const searchResult = await withRateLimit('search', () =>
              this.spotifyApi.searchTracks(query, { limit: 5 })
            );

            const tracks = searchResult.body.tracks?.items.map((track) => ({
              name: track.name,
              artist: track.artists[0].name,
              albumName: track.album.name,
              releaseDate: track.album.release_date,
              popularity: track.popularity,
              id: track.id,
              uri: track.uri
            }));

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(tracks, null, 2),
                },
              ],
            };
          }

          case 'get_playback_state': {
            const playbackState = await withRateLimit('playback', () =>
              this.spotifyApi.getMyCurrentPlaybackState()
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(playbackState.body || 'No active playback', null, 2),
                },
              ],
            };
          }

          case 'play_track': {
            const { uri } = request.params.arguments as { uri: string };

            await withRateLimit('playback', () =>
              this.spotifyApi.play({ uris: [uri] })
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ status: 'Playing track', uri }, null, 2),
                },
              ],
            };
          }

          case 'get_user_playlists': {
            const { limit = 20 } = request.params.arguments as { limit?: number };

            const playlistResult = await withRateLimit('search', () =>
              this.spotifyApi.getUserPlaylists({ limit })
            );

            const playlists = playlistResult.body.items.map((playlist) => ({
              name: playlist.name,
              id: playlist.id,
              trackCount: playlist.tracks.total,
              uri: playlist.uri,
              public: playlist.public,
            }));

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(playlists, null, 2),
                },
              ],
            };
          }

          case 'pause_playback': {
            await withRateLimit('playback', () =>
              this.spotifyApi.pause()
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ status: 'Playback paused' }, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Spotify API error: ${(error as Error).message}`
        );
      }
    });
  }

  // Ensure we have a valid token before making API calls
  private async ensureValidToken(): Promise<void> {
    const now = Date.now();
    
    // If token is expired or will expire in the next 5 minutes
    if (now >= this.tokenExpirationTime - 5 * 60 * 1000) {
      try {
        if (this.spotifyApi.getRefreshToken()) {
          // If we have a refresh token, use it
          const data = await this.spotifyApi.refreshAccessToken();
          this.spotifyApi.setAccessToken(data.body.access_token);
          // Update expiration time (subtract 1 minute for safety)
          this.tokenExpirationTime = now + data.body.expires_in * 1000 - 60000;
          console.error('Token refreshed successfully');
        } else {
          // Need to authenticate from scratch
          await this.authenticate();
        }
      } catch (error) {
        console.error('Token refresh failed, need to authenticate again');
        await this.authenticate();
      }
    }
  }

  // Authenticate with Spotify via OAuth
  private async authenticate(): Promise<void> {
    // Create the authorization URL
    const scopes = ['user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing', 'playlist-read-private'];
    const authUrl = this.spotifyApi.createAuthorizeURL(scopes, 'state');
    
    console.error('Opening browser for Spotify authentication...');
    console.error(`If browser doesn't open automatically, visit: ${authUrl}`);
    
    // Open the authorization URL in a browser
    await open(authUrl);
    
    // Start server to receive callback
    const authorizationCode = await startAuthServer();
    
    // Exchange authorization code for access token
    const data = await this.spotifyApi.authorizationCodeGrant(authorizationCode);
    
    // Set the access token and refresh token
    this.spotifyApi.setAccessToken(data.body.access_token);
    this.spotifyApi.setRefreshToken(data.body.refresh_token);
    
    // Calculate when the token will expire (subtract 1 minute for safety)
    this.tokenExpirationTime = Date.now() + data.body.expires_in * 1000 - 60000;
    
    console.error('Authentication successful');
  }

  async run() {
    // First authenticate with Spotify
    await this.authenticate();
    
    // Then connect to MCP transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Spotify MCP server running on stdio');
  }
}

const server = new SpotifyMcpServer();
server.run().catch(console.error);