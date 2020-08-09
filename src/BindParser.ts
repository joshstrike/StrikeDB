/* Many thanks to user plalx on StackOverflow for the essential elements of the parser */

import * as mysql from 'mysql';

export type Binding = {start:number,end:number,name:string,field:boolean};
export class BindParser {
    public static BindingCharRx:RegExp = /\w/; //Note: bound names must be only \w strings or parsing will fail. Extend this if needed.
    public static ParseBindings(sql:string):Binding[] {
        let bindings:Binding[] = [];
        let i:number = 0;
        let lookahead:string = sql[i];
        while (lookahead) {
            if (isStringDelim(lookahead)) parseString();
            else if (lookahead === ':' && peek() !== '=') parseBinding();
            else consume();
        }
        return (bindings);
        
        function isStringDelim(char:string) {
            return char === "'" || char === '"';
        }
        
        function parseString() {
            let start:number = i,
                delim = lookahead;
            consume();
            while (lookahead) {
                if (lookahead === '\\') {
                    consume();
                    consume();
                    continue;
                }
                if (lookahead === delim) {
                    consume();
                    if (lookahead !== delim) return;
                }
                consume();
            }
            throw new Error(`Underterminated string literal starting at index ${start}.`);
        }
        
        function parseBinding() {
            const start:number = i;
            let field:boolean = false;
            consume();
            if (lookahead==":" && BindParser.BindingCharRx.test(peek())) {
                consume();
                field = true;
            }
            while (lookahead && BindParser.BindingCharRx.test(lookahead)) consume();
            const name:string = sql.slice(start + (field ? 2 : 1), i);
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
        
        function consume():void {
            lookahead = sql[++i];
        }
        
        function peek():string {
            return sql[i + 1]
        }
    }
    
    public static InlineBindings(sql:string):{newSql:string,bindings:Binding[]} {
        let res:{newSql:string,bindings:Binding[]} = {newSql:'',bindings:this.ParseBindings(sql)};

        let lastIndex:number = 0;
        let replacement:string;

        for (const binding of res.bindings) {
            replacement = binding.field ? "??" : "?";
            res.newSql += sql.slice(lastIndex, binding.start) + replacement;
            lastIndex = binding.end;
        }
        res.newSql += sql.slice(lastIndex);        
        return (res);
    }
}
