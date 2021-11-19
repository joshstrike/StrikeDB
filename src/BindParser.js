/* Many thanks to user plalx on StackOverflow for the essential elements of the parser */
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.BindParser = void 0;
    class BindParser {
        static BindingCharRx = /\w/; //Note: bound names must be only \w strings or parsing will fail. Extend this if needed.
        static ParseBindings(sql) {
            let bindings = [];
            let i = 0;
            let lookahead = sql[i];
            while (lookahead) {
                if (isStringDelim(lookahead))
                    parseString();
                else if (lookahead === ':' && peek() !== '=')
                    parseBinding();
                else
                    consume();
            }
            return (bindings);
            function isStringDelim(char) {
                return char === "'" || char === '"';
            }
            function parseString() {
                let start = i, delim = lookahead;
                consume();
                while (lookahead) {
                    if (lookahead === '\\') {
                        consume();
                        consume();
                        continue;
                    }
                    if (lookahead === delim) {
                        consume();
                        if (lookahead !== delim)
                            return;
                    }
                    consume();
                }
                throw new Error(`Underterminated string literal starting at index ${start}.`);
            }
            function parseBinding() {
                const start = i;
                let field = false;
                consume();
                if (lookahead == ":" && BindParser.BindingCharRx.test(peek())) {
                    consume();
                    field = true;
                }
                while (lookahead && BindParser.BindingCharRx.test(lookahead))
                    consume();
                const name = sql.slice(start + (field ? 2 : 1), i);
                if (!name.length) {
                    throw new Error(`Invalid binding starting at index ${start}.`);
                }
                bindings.push({
                    start,
                    end: i,
                    name: name,
                    field: field
                });
            }
            function consume() {
                lookahead = sql[++i];
            }
            function peek() {
                return sql[i + 1];
            }
        }
        static InlineBindings(sql) {
            let res = { newSql: '', bindings: this.ParseBindings(sql) };
            let lastIndex = 0;
            let replacement;
            for (const binding of res.bindings) {
                replacement = binding.field ? "??" : "?";
                res.newSql += sql.slice(lastIndex, binding.start) + replacement;
                lastIndex = binding.end;
            }
            res.newSql += sql.slice(lastIndex);
            return (res);
        }
    }
    exports.BindParser = BindParser;
});
