/* eslint-disable prefer-const */ // to satisfy AS compiler
import { log } from '@graphprotocol/graph-ts/index'

import {
    Transfer
} from '../generated/BirdPlus/BirdPlus'

import { 
    Account
} from '../generated/schema'

import {
    mantissaFactorBD,
    mantissaFactor
  } from './helpers'

/* Transferring of BirdPlus
 *
 * event.params.from = sender of BirdPlus
 * event.params.to = receiver of BirdPlus
 * event.params.amount = amount sent
 */
export function handleBirdPlusTransfer(event: Transfer): void {
    let birdPlusID = event.address.toHexString()

    /*let accountFromID = event.params.from.toHex()
    if (accountFromID != birdPlusID) {
        let accountFrom = Account.load(accountFromID)
        if (accountFrom != null) {
            accountFrom.birdPlusBalance = accountFrom.birdPlusBalance.minus(event.params.amount
                .toBigDecimal().div(mantissaFactorBD).truncate(mantissaFactor))
            accountFrom.save()
        }
    } 

    let accountToID = event.params.to.toHex()
    if (accountToID != birdPlusID) {
        let accountTo = Account.load(accountToID)
        if (accountTo != null) {
            accountTo.birdPlusBalance = accountTo.birdPlusBalance.plus(event.params.amount
                .toBigDecimal().div(mantissaFactorBD).truncate(mantissaFactor))
            accountTo.save()
        }
    }*/
}
  
