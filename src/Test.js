var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./StrikeDB"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var DB = require("./StrikeDB");
    var Test2 = (function () {
        function Test2() {
            var _this = this;
            //Use a familiar PoolConfig:
            var config = { host: 'localhost', user: 'my_user', password: 'my_password', database: 'NBA',
                supportBigNumbers: true, waitForConnections: true, connectionLimit: 10, multipleStatements: true };
            //Set up a pool which you'll call to get DBConnection objects. 
            this.pool = new DB.Pool(config);
            this.asyncTests().then(function () { return _this.otherTests().then(function () { return _this.rejectionTest(); }); });
        }
        Test2.prototype.asyncTests = function () {
            return __awaiter(this, void 0, void 0, function () {
                var conn, stm, newStm, p, _i, _a, team, statements;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, this.pool.getConnection({ rejectErrors: false, logQueries: true })];
                        case 1:
                            conn = _b.sent();
                            return [4 /*yield*/, conn.prepare({ sql: "SELECT * FROM games WHERE homeID=:homeID LIMIT 1" })];
                        case 2:
                            stm = _b.sent();
                            //now execute it:
                            return [4 /*yield*/, stm.execute({ homeID: 'ATL' })];
                        case 3:
                            //now execute it:
                            _b.sent();
                            if (stm.err)
                                console.log(stm.err);
                            else
                                console.log(stm.result);
                            return [4 /*yield*/, stm.execute({ homeID: 'DEN' }, true)];
                        case 4:
                            newStm = _b.sent();
                            if (newStm.err)
                                console.log(newStm.err, newStm._execOpts.sql);
                            else
                                console.log(newStm.result);
                            p = [];
                            for (_i = 0, _a = ['BOS', 'CHI', 'MEM']; _i < _a.length; _i++) {
                                team = _a[_i];
                                p.push(stm.execute({ homeID: team }, true));
                            }
                            return [4 /*yield*/, Promise.all(p)];
                        case 5:
                            statements = _b.sent();
                            console.log(statements.map(function (s) { return s.result[0]; }));
                            //deallocate the server-side prepared statement. Important on server-side executions if you're not planning to close the connection for a long time.
                            //This is not necessary if you prepared the statement using emulation.
                            stm.deallocate();
                            //remember to release the connection.
                            conn.release();
                            return [2 /*return*/];
                    }
                });
            });
        };
        Test2.prototype.otherTests = function () {
            return __awaiter(this, void 0, void 0, function () {
                var conn, stm, stm2, stm3;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.pool.getConnection({ rejectErrors: false, logQueries: true })];
                        case 1:
                            conn = _a.sent();
                            return [4 /*yield*/, conn.prepare({ sql: "SELECT * FROM games WHERE homeID=? LIMIT 1" })];
                        case 2:
                            stm = _a.sent();
                            return [4 /*yield*/, stm.execute(['ATL'])];
                        case 3:
                            _a.sent();
                            if (stm.err)
                                console.log(stm.err);
                            else
                                console.log(stm.result);
                            stm.deallocate();
                            return [4 /*yield*/, conn.prepare({ sql: "SELECT * FROM ::table WHERE homeID=:homeID LIMIT 1", emulate: true })];
                        case 4:
                            stm2 = _a.sent();
                            return [4 /*yield*/, stm2.execute({ table: 'games', homeID: 'ATL' })];
                        case 5:
                            _a.sent();
                            if (stm2.err)
                                console.log(stm2.err);
                            else
                                console.log(stm2.result);
                            return [4 /*yield*/, conn.exec({ sql: "SELECT * FROM ::table WHERE homeID=:homeID LIMIT 1", values: { table: 'games', homeID: 'ATL' }, emulate: true })];
                        case 6:
                            stm3 = _a.sent();
                            if (stm3.err)
                                console.log(stm3.err);
                            else
                                console.log(stm3.result);
                            conn.release();
                            return [2 /*return*/];
                    }
                });
            });
        };
        Test2.prototype.rejectionTest = function () {
            return __awaiter(this, void 0, void 0, function () {
                var conn, stm;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.pool.getConnection({ rejectErrors: true, logQueries: true })];
                        case 1:
                            conn = _a.sent();
                            return [4 /*yield*/, conn.prepare({ sql: "INSERT INTO nonexistent_table VALUES ('',?);", nestTables: '_' }).
                                    catch(function (s) { console.log('REJECTED PREPARE:', s.err.message); return (s); })];
                        case 2:
                            stm = _a.sent();
                            return [4 /*yield*/, stm.execute(['ATL']).catch(function (s) { console.log('REJECTED EXECUTION:', s.err.message); return (s); })];
                        case 3:
                            _a.sent();
                            if (stm.err)
                                console.log('CHECKED STM.ERR LATER:', stm.err.message); //you could log it in the catch, or later.
                            else
                                console.log(stm.result);
                            stm.deallocate();
                            return [2 /*return*/];
                    }
                });
            });
        };
        return Test2;
    }());
    new Test2();
});
