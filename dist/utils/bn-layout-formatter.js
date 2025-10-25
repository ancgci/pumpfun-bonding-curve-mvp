"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bnLayoutFormatter = void 0;
const lodash_1 = require("lodash");
function bnLayoutFormatter(obj) {
    for (const key in obj) {
        if (obj[key]?.constructor?.name === "PublicKey") {
            obj[key] = obj[key].toBase58();
        }
        else if (obj[key]?.constructor?.name === "BN") {
            obj[key] = Number(obj[key].toString());
        }
        else if (obj[key]?.constructor?.name === "BigInt") {
            obj[key] = Number(obj[key].toString());
        }
        else if (obj[key]?.constructor?.name === "Buffer") {
            obj[key] = obj[key].toString("base64");
        }
        else if ((0, lodash_1.isObject)(obj[key])) {
            bnLayoutFormatter(obj[key]);
        }
        else {
            obj[key] = obj[key];
        }
    }
}
exports.bnLayoutFormatter = bnLayoutFormatter;
//# sourceMappingURL=bn-layout-formatter.js.map