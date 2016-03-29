/// <reference path="./typings/tsd.d.ts" />
"use strict";
(function (TokenType) {
    TokenType[TokenType["Word"] = 0] = "Word";
    TokenType[TokenType["WordEnd"] = 1] = "WordEnd";
    TokenType[TokenType["Empty"] = 2] = "Empty";
    TokenType[TokenType["Number"] = 3] = "Number";
    TokenType[TokenType["Junk"] = 4] = "Junk";
    TokenType[TokenType["Money"] = 5] = "Money"; //$75,000
})(exports.TokenType || (exports.TokenType = {}));
var TokenType = exports.TokenType;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TokenType;
//# sourceMappingURL=markov.types.js.map