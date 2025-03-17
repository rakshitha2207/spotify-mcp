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
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Load environment variables
dotenv.config();

// Spotify API client setup
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID ?? '',
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? '',
  redirectUri: process.env.SPOTIFY_REDIRECT_URI ?? '',
});

// Track rate limit reset times (similar to Twitter's setup)
const rateLimitResets: { [key: string]: number } = {
  'search': 0,
  'playback': 0,
};

// Helper function for rate limit handling (adapted for Spotify)
async function withRateLimit<T>(endpoint: 'search' | 'playback', fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const resetTime = rateLimitResets[endpoint];

  if (now < resetTime) {
    const waitTime = resetTime - now + 1000; // Add 1 second buffer
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  try {
    const result = await fn();
    // Spotify's rate limit is typically 180 requests per minute, so we'll set a conservative reset time (e.g., 10 seconds)
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

class SpotifyMcpServer {
  private server: Server;
  private spotifyApi: SpotifyWebApi;

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
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        // Ensure access token is set
        if (!this.spotifyApi.getAccessToken()) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Spotify access token not set. Please authenticate first.'
          );
        }

        switch (request.params.name) {
          case 'search_tracks': {
            const { query } = request.params.arguments as { query: string };

            const searchResult = await withRateLimit('search', () =>
              this.spotifyApi.searchTracks(query, { limit: 5 })
            );

            const tracks = searchResult.body.tracks?.items.map((track) => ({
              name: track.name,
              artist: track.artists[0].name,
              id: track.id,
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Spotify MCP server running on stdio');
  }

  // Method to set the access token after authentication
  setAccessToken(token: string) {
    this.spotifyApi.setAccessToken(token);
  }
}

const server = new SpotifyMcpServer();

// For now, manually set the access token (replace with proper OAuth flow later)
server.setAccessToken('db3638cd8cb64da2ba5aa136b555bb46');

server.run().catch(console.error);