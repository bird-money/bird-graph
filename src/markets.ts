/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts/index'
import { Market, BirdCore, MarketToken, MarketUnderlyingToken } from '../generated/schema'
import { PriceOracle } from '../generated/BToken/PriceOracle'
import { ERC20 } from '../generated/BToken/ERC20'
import { BToken } from '../generated/BToken/BToken'

import {
  exponentToBigDecimal,
  mantissaFactor,
  mantissaFactorBD,
  bTokenDecimalsBD,
  zeroBD,
} from './helpers'

let bUSDCAddress = '0x565b245fc6c9f9783f148e56e93d998968f89c7e'
let bETHAddress = '0x1d8eb5a97ce0b8812d7e17893018467a47e2f7d9'

// Used for all cERC20 contracts
function getTokenPrice(
  blockNumber: i32,
  eventAddress: Address,
  underlyingAddress: Address,
  underlyingDecimals: i32,
): BigDecimal {
  let comptroller = BirdCore.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  let underlyingPrice: BigDecimal

    let oracle1 = PriceOracle.bind(oracleAddress)
    underlyingPrice = oracle1
      .getUnderlyingPrice(eventAddress)
      .toBigDecimal()
      .div(mantissaFactorBD)
  return underlyingPrice
}

// Returns the price of USDC in eth. i.e. 0.005 would mean ETH is $200
function getUSDCpriceETH(blockNumber: i32): BigDecimal {
  let comptroller = BirdCore.load('1')
  let oracleAddress = comptroller.priceOracle as Address
  let usdPrice: BigDecimal

  // See notes on block number if statement in getTokenPrices()
  let oracle1 = PriceOracle.bind(oracleAddress)
  usdPrice = oracle1
    .getUnderlyingPrice(Address.fromString(bUSDCAddress))
    .toBigDecimal()
    .div(mantissaFactorBD)
  return usdPrice
}

// Create new bToken market 
export function createMarket(marketAddress: string): Market {
  let market: Market
  let contract = BToken.bind(Address.fromString(marketAddress))
  
  if (contract !== null && contract.symbol() !== null && !contract.try_isBToken().reverted) {
    let marketToken = MarketToken.load(contract.symbol())
    if (marketToken == null) {
      marketToken = new MarketToken(contract.symbol())
      marketToken.address = Address.fromString(marketAddress)
      marketToken.save()
    } else if (marketToken.address != Address.fromString(marketAddress)) {
      return null;
    }
  } else {
    return null;
  }

  // It is CETH, which has a slightly different interface
  if (marketAddress == bETHAddress) {
    market = new Market(marketAddress)
    market.underlyingAddress = Address.fromString(
      '0x0000000000000000000000000000000000000000',
    )
    market.underlyingDecimals = 18
    market.underlyingPrice = BigDecimal.fromString('1')
    market.underlyingName = 'Ether'
    market.underlyingSymbol = 'ETH'
    market.underlyingPriceUSD = zeroBD
    // It is all other BERC20 contracts
  } else {
    market = new Market(marketAddress)
    market.underlyingAddress = contract.underlying()
    let underlyingContract = ERC20.bind(market.underlyingAddress as Address)
    market.underlyingDecimals = underlyingContract.decimals()
   
    market.underlyingName = underlyingContract.name()
    market.underlyingSymbol = underlyingContract.symbol()

    market.underlyingPriceUSD = zeroBD
    market.underlyingPrice = zeroBD
    if (marketAddress == bUSDCAddress) {
      market.underlyingPriceUSD = BigDecimal.fromString('1')
    }
    let underlyingAddress = market.underlyingAddress.toHexString()
    let underlyingToken = MarketUnderlyingToken.load(underlyingAddress);
    if (underlyingToken == null) {
      underlyingToken = new MarketUnderlyingToken(underlyingAddress)
      underlyingToken.marketAddress = Address.fromString(marketAddress)
      underlyingToken.symbol = contract.symbol()
      underlyingToken.save()
    }
  }

  let interestRateModelAddress = contract.try_interestRateModel()
  let reserveFactor = contract.try_reserveFactorMantissa()

  market.borrowRate = zeroBD
  market.cash = zeroBD
  market.collateralFactor = zeroBD
  market.exchangeRate = zeroBD
  market.birdPlusSpeed = zeroBD
  market.interestRateModelAddress = interestRateModelAddress.reverted ? Address.fromString(
    '0x0000000000000000000000000000000000000000') : interestRateModelAddress.value,
  market.name = contract.name()
  market.numberOfBorrowers = 0
  market.numberOfSuppliers = 0
  market.reserves = zeroBD
  market.supplyRate = zeroBD
  market.symbol = contract.symbol()
  market.totalBorrows = zeroBD
  market.totalSupply = zeroBD
  market.underlyingPrice = zeroBD

  market.accrualBlockNumber = 0
  market.blockTimestamp = 0
  market.borrowIndex = zeroBD
  market.reserveFactor = reserveFactor.reverted ? BigInt.fromI32(0) : reserveFactor.value

  return market
}

export function updateMarket(
  marketAddress: Address,
  blockNumber: i32,
  blockTimestamp: i32,
): Market {
  let marketID = marketAddress.toHexString()
  let market = Market.load(marketID)
  
  if (market == null) {
    log.debug("market is null", []);
    market = createMarket(marketID)
    if (market == null) {
      return null;
    }
  }

  // Only updateMarket if it has not been updated this block
  if (market.accrualBlockNumber != blockNumber) {

    let contractAddress = Address.fromString(market.id)
    let contract = BToken.bind(contractAddress)
    let usdPriceInEth = getUSDCpriceETH(blockNumber)

    // if bETH, we only update USD price
    if (market.id == bETHAddress) {
      market.underlyingPriceUSD = market.underlyingPrice
        .div(usdPriceInEth)
        .truncate(market.underlyingDecimals)
    } else {
      let tokenPriceEth = getTokenPrice(
        blockNumber,
        contractAddress,
        market.underlyingAddress as Address,
        market.underlyingDecimals,
      )

      market.underlyingPrice = tokenPriceEth.truncate(market.underlyingDecimals)
      // if USDC, we only update ETH price
      if (market.id != bUSDCAddress) {
        market.underlyingPriceUSD = market.underlyingPrice
          .div(usdPriceInEth)
          .truncate(market.underlyingDecimals)
      }
    }

    market.accrualBlockNumber = contract.accrualBlockNumber().toI32()
    market.blockTimestamp = blockTimestamp
    market.totalSupply = contract
      .totalSupply()
      .toBigDecimal()
      .div(bTokenDecimalsBD)

    /* Exchange rate explanation
       In Practice
        - If you call the cDAI contract on etherscan it comes back (2.0 * 10^26)
        - If you call the cUSDC contract on etherscan it comes back (2.0 * 10^14)
        - The real value is ~0.02. So cDAI is off by 10^28, and cUSDC 10^16
       How to calculate for tokens with different decimals
        - Must div by tokenDecimals, 10^market.underlyingDecimals
        - Must multiply by bTokenDecimals, 10^8
        - Must div by mantissa, 10^18
     */
    market.exchangeRate = contract
      .exchangeRateStored()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .times(bTokenDecimalsBD)
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)

    market.borrowIndex = contract
      .borrowIndex()
      .toBigDecimal()
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)

    market.reserves = contract
      .totalReserves()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    market.totalBorrows = contract
      .totalBorrows()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    market.cash = contract
      .getCash()
      .toBigDecimal()
      .div(exponentToBigDecimal(market.underlyingDecimals))
      .truncate(market.underlyingDecimals)

    // Must convert to BigDecimal, and remove 10^18 that is used for Exp in Compound Solidity
    market.borrowRate = contract
      .borrowRatePerBlock()
      .toBigDecimal()
      .times(BigDecimal.fromString('2102400'))
      .div(mantissaFactorBD)
      .truncate(mantissaFactor)
    

    // This fails on only the first call to bZRX. It is unclear why, but otherwise it works.
    // So we handle it like this.
    let supplyRatePerBlock = contract.try_supplyRatePerBlock()
    if (supplyRatePerBlock.reverted) {
      log.info('***CALL FAILED*** : bERC20 supplyRatePerBlock() reverted', [])
      market.supplyRate = zeroBD
    } else {
      market.supplyRate = supplyRatePerBlock.value
        .toBigDecimal()
        .times(BigDecimal.fromString('2102400'))
        .div(mantissaFactorBD)
        .truncate(mantissaFactor)
    }
    
    market.save()

  }
  return market as Market
}