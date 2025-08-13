import { platform } from 'os'
import { execSync } from 'child_process'

// On Windows, use WSL IP address for proper networking
// On Unix, use localhost
function getHost() {
  if (platform() === 'win32') {
    try {
      // Get WSL IP address
      const wslIp = execSync('wsl hostname -I', { stdio: 'pipe' }).toString().trim().split(' ')[0]
      return wslIp
    } catch {
      // Fallback to localhost if we can't get WSL IP
      return '127.0.0.1'
    }
  }
  return '127.0.0.1'
}

export const HOST = getHost()
export const PORT = 18_443
export const ELECTRUM_PORT = 7_777
export const ZMQ_PORT = 29_000
export const DATA_DIR = '.bitcoin'
