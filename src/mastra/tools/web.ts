import { MCPClient } from '@mastra/mcp'

// ブラウザ操作・Web検索のためのMCPサーバー

export const webMcp = new MCPClient({
  id: 'web-mcp',
  servers: {
    playwright: {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    },
    'brave-search': {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: {
        BRAVE_API_KEY: process.env.BRAVE_API_KEY || '',
      },
    },
  },
})
