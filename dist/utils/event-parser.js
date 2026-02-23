"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaEventParser = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@project-serum/anchor");
const lodash_1 = require("lodash");
class SolanaEventParser {
    logger;
    eventDecoders;
    constructor(programInfos, logger) {
        this.logger = logger;
        this.eventDecoders = new Map();
        for (const programInfo of programInfos) {
            this.addParserFromIdl(new web3_js_1.PublicKey(programInfo.programId), programInfo.idl);
        }
    }
    addParserFromIdl(programId, idl) {
        if (idl?.events) {
            try {
                const coder = new anchor_1.BorshCoder(idl);
                this.eventDecoders.set(programId, coder);
            }
            catch (e) {
                this.logger.error({
                    message: "SolanaEventParser.addParserFromIdl_error",
                    data: { programId },
                    error: e,
                });
            }
        }
    }
    removeParser(programId) {
        this.eventDecoders.delete(programId);
    }
    parseEvent(txn) {
        try {
            let programIds = [];
            if (txn?.transaction.message instanceof web3_js_1.Message ||
                txn?.transaction.message instanceof web3_js_1.MessageV0) {
                const accountKeys = txn.transaction.message.staticAccountKeys;
                txn.transaction.message.compiledInstructions.forEach((instruction) => {
                    const programId = accountKeys[instruction.programIdIndex];
                    if (programId) {
                        programIds.push(programId.toBase58());
                    }
                });
            }
            else {
                txn.transaction.message.instructions.forEach((instruction) => {
                    programIds.push(instruction.programId.toBase58());
                });
            }
            const availableProgramIds = Array.from(this.eventDecoders.keys()).map((programId) => programId.toString());
            const commonProgramIds = (0, lodash_1.intersection)(availableProgramIds, programIds);
            if (commonProgramIds.length) {
                const events = [];
                for (const programId of commonProgramIds) {
                    const eventCoder = this.eventDecoders.get(programId);
                    if (!eventCoder) {
                        continue;
                    }
                    const eventParser = new anchor_1.EventParser(new web3_js_1.PublicKey(programId), eventCoder);
                    const eventsArray = Array.from(eventParser.parseLogs(txn?.meta?.logMessages));
                    events.push(...eventsArray);
                }
                return events;
            }
            else {
                return [];
            }
        }
        catch (e) {
            return [];
        }
    }
    parseProgramLogMessages(programId, rawLogs) {
        try {
            const eventCoder = this.eventDecoders.get(programId);
            if (!eventCoder) {
                return [];
            }
            const eventParser = new anchor_1.EventParser(new web3_js_1.PublicKey(programId), eventCoder);
            return Array.from(eventParser.parseLogs(rawLogs));
        }
        catch (err) {
            this.logger.error({
                message: "SolanaEventParser.parseProgramLogMessages_error",
                data: { programId, rawLogs },
                error: err,
            });
            return [];
        }
    }
    getEventCoder(programId) {
        return this.eventDecoders.get(programId);
    }
}
exports.SolanaEventParser = SolanaEventParser;
//# sourceMappingURL=event-parser.js.map