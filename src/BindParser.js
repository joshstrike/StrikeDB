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
    var BindParser = (function () {
        function BindParser() {
        }
        BindParser.ParseBindings = function (sql) {
            var bindings = [];
            var i = 0;
            var lookahead = sql[i];
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
                var start = i, delim = lookahead;
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
                throw new Error("Underterminated string literal starting at index " + start + ".");
            }
            function parseBinding() {
                var start = i;
                var field = false;
                consume();
                if (lookahead == ":" && BindParser.BindingCharRx.test(peek())) {
                    consume();
                    field = true;
                }
                while (lookahead && BindParser.BindingCharRx.test(lookahead))
                    consume();
                var name = sql.slice(start + (field ? 2 : 1), i);
                if (!name.length) {
                    throw new Error("Invalid binding starting at index " + start + ".");
                }
                bindings.push({
                    start: start,
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
        };
        BindParser.InlineBindings = function (sql) {
            var res = { newSql: '', bindings: this.ParseBindings(sql) };
            var lastIndex = 0;
            var replacement;
            for (var _i = 0, _a = res.bindings; _i < _a.length; _i++) {
                var binding = _a[_i];
                replacement = binding.field ? "??" : "?";
                res.newSql += sql.slice(lastIndex, binding.start) + replacement;
                lastIndex = binding.end;
            }
            res.newSql += sql.slice(lastIndex);
            return (res);
        };
        BindParser.BindingCharRx = /\w/; //Note: bound names must be only \w strings or parsing will fail. Extend this if needed.
        return BindParser;
    }());
    exports.BindParser = BindParser;
});
