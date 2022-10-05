const path = require('path')
const { promisify } = require('util')
const { NULL_ADDRESS } = require('./constants')

const abort = (message, logger = console, code = 1) => {
  logger.error(message)
  process.exit(code)
}

const enforce = (condition, message, logger, code) => {
  if (!condition) abort(message, logger, code)
}

const enforceOrThrow = (condition, message) => {
  if (!condition) throw new Error(message)
}

/**
 * The metadata in the Truffle artifact file changes source paths on Windows. Instead of
 * D:\Hello\World.sol, it looks like /D/Hello/World.sol. When trying to read this path,
 * Windows cannot find it, since it is not a valid path. This function changes
 * /D/Hello/World.sol to D:\Hello\World.sol. This way, Windows is able to read these source
 * files. It does not change regular Unix paths, only Unixified Windows paths. It also does
 * not make any changes on platforms that aren't Windows.
 *
 * @param {string} contractPath path to a contract file in any format.
 * @param {any} options Options object containing the parsed truffle-plugin-verify options
 * @returns {string} path to the contract in Windows format when on Windows, or Unix format otherwise.
 */
const normaliseContractPath = (contractPath, options) => {
  // Replace the 'project:' prefix that was added in Truffle v5.3.14 with the actual project path
  const absolutePath = getAbsolutePath(contractPath, options)

  // If the current platform is not Windows, the path does not need to be changed
  if (process.platform !== 'win32') return absolutePath

  // If the contract path doesn't start with '/[A-Z]/' it is not a Unixified Windows path
  if (!absolutePath.match(/^\/[A-Z]\//i)) return absolutePath

  const driveLetter = absolutePath.substring(1, 2)
  const normalisedContractPath = path.resolve(`${driveLetter}:/${absolutePath.substring(3)}`)

  return normalisedContractPath
}

/**
 * @param {string} contractPath path to a contract file in any format.
 * @param {any} options Options object containing the parsed truffle-plugin-verify options
 * @returns {string} absolute path to the contract source file
 */
const getAbsolutePath = (contractPath, options) => {
  // Older versions of truffle already used the absolute path
  // Also node_modules contracts don't use the project: prefix
  if (!contractPath.startsWith('project:/')) return contractPath

  const relativeContractPath = contractPath.replace('project:/', '')
  const absolutePath = path.join(options.projectDir, relativeContractPath)

  return absolutePath
}

/**
 * If the network config includes a provider we use it to retrieve the network info
 * for the network. If that fails, we fall back to the config's network ID.
 * @param {any} config
 * @param {any} logger
 * @returns {Promise<number>} Chain ID & Network ID if they could be retrieved, or else config'd network ID
 */
const getNetwork = async (config, logger) => {
  const send = getRpcSendFunction(config.provider)

  const fallback = { chainId: config.network_id, networkId: config.network_id }

  if (!send) {
    logger.debug('No (valid) provider configured, using config network ID as fallback')
    return fallback
  }

  try {
    logger.debug('Retrieving network\'s network ID & chain ID')

    const chainIdResult = await send({ jsonrpc: '2.0', id: Date.now(), method: 'eth_chainId', params: [] })
    const networkIdResult = await send({ jsonrpc: '2.0', id: Date.now(), method: 'net_version', params: [] })

    const chainId = chainIdResult && Number.parseInt(chainIdResult.result, 16)
    const networkId = networkIdResult && Number.parseInt(networkIdResult.result, 10)

    // Throw an error that gets caught by the try-catch
    if (!networkId || !chainId) {
      throw new Error('Could not retrieve network chain ID or network ID')
    }

    return { chainId, networkId }
  } catch {
    logger.debug('Failed to retrieve network information, using configurated network ID instead')
    return fallback
  }
}

/**
 * Get a promisified RPC Send function from a provider
 * @param {any | undefined} provider a provider or undefined
 * @returns {any | undefined} a promisified RPC send function
 */
const getRpcSendFunction = (provider) => (
  provider && provider.sendAsync
    ? promisify(provider.sendAsync.bind(provider))
    : provider && provider.send
      ? promisify(provider.send.bind(provider))
      : undefined
)

const deepCopy = (obj) => JSON.parse(JSON.stringify(obj))

const getAddressFromStorage = (storage) => `0x${storage.slice(2).slice(-40).padStart(40, '0')}`

module.exports = {
  abort,
  enforce,
  enforceOrThrow,
  normaliseContractPath,
  getNetwork,
  deepCopy
}
