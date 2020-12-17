/* eslint-disable prefer-const */ // to satisfy AS compiler
import { BigDecimal, log } from '@graphprotocol/graph-ts/index'

import {
    Approval
} from '../generated/UnderlyingToken/ERC20'

import {
    MarketUnderlyingToken,
    Account,
    Market,
    ApprovalEvent
} from '../generated/schema'

import {
    createAccount,
    updateCommonBTokenStats
  } from './helpers'

export function handleApproval(event: Approval): void {
    let underlyingID = event.address.toHexString()
    let underlyingToken = MarketUnderlyingToken.load(underlyingID)
    if (underlyingToken != null) {
        let ownerID = event.params.owner.toHex()
        let marketID = event.params.spender.toHex()
        let market = Market.load(marketID)
        if (market != null) {
            let accountFrom = Account.load(ownerID)
            if (accountFrom == null) {
                createAccount(ownerID)
            }

            // Update bTokenStats common for all events, and return the stats to update unique
            // values for each event
            let bTokenStatsFrom = updateCommonBTokenStats(
                market.id,
                market.symbol,
                ownerID,
                event.transaction.hash,
                event.block.timestamp.toI32(),
                event.block.number.toI32(),
            )

            bTokenStatsFrom.isUnderlyingApproved = true;

            bTokenStatsFrom.save()

            let transferID = event.transaction.hash
            .toHexString()
            .concat('-')
            .concat(event.transactionLogIndex.toString())
        
            let approval = new ApprovalEvent(transferID)
            approval.amount = event.params.value.toBigDecimal() //.div(market.underlyingDecimals)
            approval.spender = event.params.spender
            approval.owner = event.params.owner
            approval.blockNumber = event.block.number.toI32()
            approval.blockTime = event.block.timestamp.toI32()
            approval.bTokenSymbol = market.symbol
            approval.save()
        }
    }
}