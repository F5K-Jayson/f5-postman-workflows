/**
 * @file Implement framework to create workflows with Postman collections
 * @author Hitesh Patel, F5 Networks
 * @version 1.0
 */

// Global variable to cache JSON data
var _f5_json;

// Version info
var _f5_version = {
    MAJOR: "1.0",
    MINOR: "0"
};

// Fixups tests[] so we can eval() into pre-request scripts
tests = typeof tests === 'undefined' ? [] : tests;

/**
 * @function f5_get_version
 * @returns {String}
 */
function f5_get_version() {
    return(_f5_version.MAJOR.toString() + '.' + _f5_version.MINOR.toString());
}

/**
 * @function f5_populate_env_vars
 * @param {Object[]} vars - An array of env variables to populate
 * @param {String} vars[].name - Name of the env variable to populate
 * @param {String|Function} vars[].value - Name of attribute in response JSON
 *                                         -OR- a function(json) {} that returns
 *                                         the value or undefined.
 * @returns {Undefined}
 * @desc Populate Postman environment variables from a JSON formatted response.
 * Boolean test items are populated as follows:
 */
function f5_populate_env_vars(vars) {
    if(!vars) {
        return undefined;
    }

    var poll = parseInt(postman.getGlobalVariable("_f5_enable_polled_mode"),10);

    if(!f5_check_response_code()) {
        f5_debug("response code bad, next is null");
        if(!poll && !parseInt(postman.getGlobalVariable("_f5_poll_bypass_timeout"),10)) {
            postman.setNextRequest(null);
        }
        return;
    }

    var json = f5_parse_json_resp();
    for (var i = 0; i < vars.length; i++) {
        var test_name = '[Populate Variable] ' + vars[i].name + "=";

        f5_debug("name=" + vars[i].name);

        if (typeof vars[i].value === 'function') {
            f5_debug("running custom function");
            var args = !('args' in vars[i]) ? [json] : [json].concat(vars[i].args);
            var ret = vars[i].value.apply(this, args);

            if (ret !== undefined) {
                f5_set_test_result(test_name, 1, ret);
                postman.setEnvironmentVariable(vars[i].name, ret);
            }
            else {
                f5_set_test_result(test_name, 0, undefined);
                postman.setEnvironmentVariable(vars[i].name, "");
            }
        } else {
            var obj = f5_get_by_string(vars[i].value);
            f5_debug("obj=" + obj);

            if(obj) {
                f5_debug("found attribute");
                postman.setEnvironmentVariable(vars[i].name, obj);
                f5_set_test_result(test_name, 1, obj);
            } else {
                f5_debug("did not find attribute");
                f5_set_test_result(test_name, 0, undefined);
                if(!poll && !parseInt(postman.getGlobalVariable("_f5_poll_bypass_timeout"),10)) {
                    postman.setNextRequest(null);
                }
            }
        }
    }
    return;
}

/**
 * @function f5_check_response
 * @param {Object[]} vars - An array of env variables to populate
 * @param {String} vars[].name - Name of the env variable to populate
 * @param {String|Function} vars[].value - Name of attribute in response JSON
 *                                         -OR- a function(json) {} that returns
 *                                         the value or undefined.
 * @returns {Undefined}
 * @desc Check HTTP response code and JSON response body.
 */
function f5_check_response(vars) {
    var poll = parseInt(postman.getGlobalVariable("_f5_enable_polled_mode"),10);

    if(vars === undefined) {
        f5_check_response_code();
        return;
    }

    if (!f5_check_response_code()) {
        f5_debug("response code bad, next is null");
        if(!poll && !parseInt(postman.getGlobalVariable("_f5_poll_bypass_timeout"),10)) {
            postman.setNextRequest(null);
        }
        return;
    }

    var json = f5_parse_json_resp();
    for (var i = 0; i < vars.length; i++) {
        if (typeof vars[i].path === 'undefined' ||
            typeof vars[i].value === 'undefined') {
            console.log('f5_check_response: ERROR: element ' + i + ' does not have path and value attributes');
            continue;
        }

        vars[i].op = typeof vars[i].op === 'undefined' ? '==' : vars[i].op
        vars[i].test = typeof vars[i].test === 'undefined' ? true : vars[i].test
        vars[i].testname = typeof vars[i].testname === 'undefined' ? vars[i].path : vars[i].testname

        var obj = f5_get_by_string(vars[i].path);
        if (obj) {
            f5_set_test_result("[Current Value] " + vars[i].testname + "=", 1, obj);
        }

        if(!vars[i].test) { continue; }

        var check_test_name = "[Check Value] "+vars[i].testname+" "+vars[i].op+ " ";
        if (typeof vars[i].value === 'function') {
            f5_debug("running custom function");
            var args = !('args' in vars[i]) ? [json] : [json].concat(vars[i].args);
            var ret = vars[i].value.apply(this, args);

            if (ret) {
                f5_set_test_result(check_test_name, 1, '[custom function]');
            }
            else {
                f5_set_test_result(check_test_name, 0, '[custom function]');
            }
        } else {
            var mf = null;
            f5_debug("op=" + vars[i].op.toLowerCase());
            switch(vars[i].op.toLowerCase()) {
                case '===':
                    mf = function(x,y) { return x === y };
                    break;
                case '!==':
                    mf = function(x,y) { return x !== y };
                    break;
                case '==':
                    mf = function(x,y) { return x == y };
                    break;
                case '!=':
                    mf = function(x,y) { return x != y };
                    break;
                case '<':
                    mf = function(x,y) { return x < y };
                    break;
                case '<=':
                    mf = function(x,y) { return x <= y };
                    break;
                case '>':
                    mf = function(x,y) { return x > y };
                    break;
                case '>=':
                    mf = function(x,y) { return x >= y };
                    break;
                case 'incl':
                    mf = function(x,y) {
                        if(typeof x === 'string') {
                            return x.includes(y);
                        }
                        if(Array.isArray(x) && x.indexOf(y) >= 0) {
                            return 1;
                        }
                        return 0;
                    };
                    break;
                case 'notincl':
                    mf = function(x,y) {
                        if(typeof x === 'string') {
                            return !(x.includes(y));
                        }
                        if(Array.isArray(x) && x.indexOf(y) < 0) {
                            return 1;
                        }
                        return 0;
                    };
                    break;
                case 'regex':
                    mf = function(x,y) {
                        if(typeof x === 'string') {
                            re = eval(y);
                            if(x.search(re) < 0) {
                                return 0;
                            }
                            return 1;
                        }
                        return 0;
                    };
                    break;
                case 'length':
                    mf = function(x,y) { return x.length == y; };
                    break;
                default:
                    break;
            }

            if(typeof mf !== 'function') {
                console.log('Invalid match op "' + vars[i].op + '" specified');
                return undefined;
            }

            f5_debug("mf=" + mf);
            f5_debug("obj=" + obj);
            var match = mf(obj, vars[i].value);
            f5_set_test_result(check_test_name, match, vars[i].value);
        }
    }
    return;
}

/**
 * @function f5_poll_until_all_tests_pass
 * @param {String} next  - The Item in the Postman Collection to execute once
 *                         all tests pass
 * @param {String} curr  - [Optional] The name of the current Item.  Normally
 *                         auto-populated with current Item name
 * @returns {Undefined}
 * @property {Number} _f5_poll_max_tries - The max number of polls
 * @property {Number} _f5_poll_wait -The time in seconds to wait between polls
 * @property {Boolean} _f5_poll_useinternal - Use the internal while() loop to
 *           sleep (WARNING: this will block the thread)
 * @property {String} _f5_poll_apiurl - The URL for an API endpoint that
 *           implements a delay
 * @property {Boolean} _f5_poll_bypass_timeout - Bypass a poller timeout and
 *           continue instead of exit
 * @property {Number} _f5_poll_interator - The current iterator value
 * @property {String} _f5_poll_curr - Name of the current Item in the Collection
 * @desc Implements a polling mechanism in Postman/Collection Runner/Newman.
 *
 * When using the external delay mechanism (_f5_poll_apiurl) this function
 * expects a Item in the Collection named '_F5_POLL_DELAY'.  This Item will be
 * shimmed into the execution flow and that Item will them callback into
 * the {curr} item to retry.
 *
 * If _f5_poll_max_tries is reached then '[Poller] Max Tries Reached' test will
 * be marked as FAIL.  If _f5_poll_bypass_timeout is NOT set the next request
 * will be set to NULL to stop execution, otherwise execution will continue.
 */
function f5_poll_until_all_tests_pass(next, curr) {
    if (curr === undefined) {
        curr = request.name;
    }

    f5_debug("curr=" + curr);
    f5_debug("next=" + next);
    var max_tries = postman.getGlobalVariable("_f5_poll_max_tries");
    var iterator = postman.getGlobalVariable("_f5_poll_iterator");
    tests['[Poller] Try ' + iterator + ' of ' + max_tries] = 1;

    if (f5_all_tests_passed() === true) {
        f5_debug("tests passed, next is '" + next + "'");
        postman.setGlobalVariable("_f5_poll_iterator", "1");
        postman.setNextRequest(next);
        return;
    }
    if (parseInt(postman.getGlobalVariable("_f5_poll_iterator"), 10) >=
        parseInt(postman.getGlobalVariable("_f5_poll_max_tries"), 10)) {
        f5_debug("reached max_tries, next is null");
        tests['[Poller] Max Tries Reached'] = 0;
        postman.setGlobalVariable("_f5_poll_iterator", "1");
        if (!parseInt(postman.getGlobalVariable("_f5_poll_bypass_timeout"), 10)){
            postman.setNextRequest(null);
        }
        return;
    }
    if (parseInt(postman.getGlobalVariable("_f5_poll_iterator"), 10) !=
        parseInt(postman.getGlobalVariable("_f5_poll_max_tries"), 10)) {
        f5_debug("tests NOT passed, trying again");
        var i = parseInt(postman.getGlobalVariable("_f5_poll_iterator"), 10);
        i++;
        postman.setGlobalVariable("_f5_poll_iterator", i);

        f5_debug("useinternal=" + parseInt(postman.getGlobalVariable("_f5_poll_useinternal"), 10));
        if(parseInt(postman.getGlobalVariable("_f5_poll_useinternal"), 10)===1){
            f5_debug("using internal sleep");
            f5_sleep(parseInt(postman.getGlobalVariable("_f5_poll_wait"), 10)*1000)
            postman.setNextRequest(curr);
            postman.setGlobalVariable("_f5_poll_curr", "");
        } else {
            f5_debug("using external sleep");
            postman.setGlobalVariable("_f5_poll_curr", curr);
            postman.setNextRequest("_F5_POLL_DELAY");
        }
    }
    return;
}

/**
 * @function f5_all_tests_passed
 * @returns {Boolean}
 * @desc Iterates thru the Postman tests[] array and determines if all specified
 * tests have failed or passed.  The function will account for both polled and
 * non-polled requests
 */
function f5_all_tests_passed() {
    for (var test in tests) {
        if(test.startsWith("[Polled] [FAIL] ")) {
            f5_debug("polled test '" + test + "' not passed, return 0");
            return false;
        }
        if(tests[test] === 0) {
            f5_debug("test '" + test + "' not passed, return 0");
            return false;
        }
    }
    f5_debug("all passed, return 1");
    return true;
}

/**
 * @function f5_check_response_code
 * @param {Number} mode - If defined a '404' response code will be added to the
 *                        okCodes for a HTTP GET
 * @returns {Number} - 1 if response code is in okCodes[{http.method}], 2 if response code is 2xx, 0 if other
 * @desc Checks the response code of the request and determines success based on
 * the HTTP method and the valid reponse codes in the okCodes object.
 */
function f5_check_response_code(mode) {
    okCodes = {
        "GET":[200,204],
        "POST":[200,201,202],
        "PUT":[200,202],
        "PATCH":[200,202],
        "DELETE":[200,202,204]
    };

    /**
     * Enum for return values
     * @enum {Number}
     */
    ret = {
        FAIL: 0,
        SUCCESS_METHOD: 1,
        SUCCESS_2XX: 2
    };

    if (mode !== undefined) {
        f5_debug("got mode, adding 404 to GET okCodes");
        okCodes.GET.push(404);
    }

    var test_name = "[" + request.method + " Response Code]=";

    if (request.method in okCodes &&
        okCodes[request.method].indexOf(responseCode.code) > -1) {
        f5_debug("response code in okCodes, return 1");
        f5_set_test_result(test_name, 1, responseCode.code);
        return ret.SUCCESS_METHOD;
    }

    if (responseCode.code >= 200 && responseCode.code < 300) {
        f5_debug("response code was 2xx, return 2");
        f5_set_test_result(test_name, 1, responseCode.code);
        return ret.SUCCESS_2XX;
    }

    f5_set_test_result(test_name, 0, responseCode.code);
    f5_debug("response code bad, return 0");
    return ret.FAIL;
}

/**
 * @function f5_set_test_result
 * @param {String} name - Base name of the test
 * @param {Boolean} result - True result of the test
 * @param {String} value - The value to convey in the test name
 * @param {Boolean} polloverride - Override test result value in polled tests
 * @returns {Undefined}
 * @desc Builds and populates the tests[] object with a test result.  When
 * running in non-polled mode the true test result will be set for the test.
 * When running in polled mode the test result with be conveyed as part of the
 * test name (PASS|FAIL) and the test will be marked successful to allow poller
 * to work correctly.
 */
function f5_set_test_result(name, result, value, polloverride) {
    if(value !== undefined) {
        if(typeof value === 'object') {
            value = JSON.stringify(value);
        }
        test_name = name + value;
    } else {
        test_name = name;
    }

    polloverride = typeof polloverride  === 'undefined' ? false : true;

    if(!parseInt(postman.getGlobalVariable("_f5_enable_polled_mode"),10)) {
        tests[test_name] = result;
        return;
    }

    if(result) {
        tests["[Polled] [PASS] " + test_name] = 1;
    } else {
        tests["[Polled] [FAIL] " + test_name] = polloverride === true ? 0 : 1;
    }
    return;
}

/**
 * @function f5_debug
 * @param {String} msg - The message to log
 * @returns {Undefined}
 * @desc Prepends the function name and dumps the message to console.log().  The
 * Postman global variable '_f5_debug' is used to toggle debug output.
 */
function f5_debug(msg) {
    if(postman.getGlobalVariable("_f5_debug") == "1") {
        console.log('[' + arguments.callee.caller.name + '] ' + msg);
    }
    return;
}

/**
 * @function f5_clear_runtime_vars
 * @param {Boolean} del - Delete rather than clear var
 * @returns {Undefined}
 * @desc Sets any Postman env variables with names starting
 * with '_rt_' to a blank value.  The 'cleared_runtime_env_vars' test is set
 * to provide feedback
 */
function f5_clear_runtime_vars(del) {
    del = typeof del === 'undefined' ? false : del;

    var envKeys = Object.keys(environment);
    for(var i = 0; i < envKeys.length; i++) {
        if(envKeys[i].startsWith("_rt_")) {
            f5_debug("clearing env variable: " + envKeys[i]);
            if(del) {
                postman.clearEnvironmentVariable(envKeys[i], "");
            } else {
                postman.setEnvironmentVariable(envKeys[i], "");
            }
        }
    }
    tests["[Cleared Runtime Env Vars]"] = 1;
    return;
}

/**
 * @function f5_poll_next
 * @returns {Undefined}
 * @desc This function is called from the '_F5_POLL_DELAY' item to retry the
 * entry item for a polled request.
 */
function f5_poll_next() {
    f5_debug("_f5_poll_curr=" + globals._f5_poll_curr)

    if(f5_check_response_code()) {
        postman.setNextRequest(globals._f5_poll_curr);
    } else {
        postman.setNextRequest(null);
    }
    postman.setGlobalVariable("_f5_poll_curr", "");
    return;
}

/**
 * @function f5_sleep
 * @param {Number} time - The time to sleep in milliseconds
 * @returns {Undefined}
 * @desc Implements a thread-blocking sleep.
 */
function f5_sleep (time) {
    f5_debug("sleeping for " + time);
    var now = new Date().getTime();
    while(new Date().getTime() < now + time){ }
    return;
}

/**
 * @function f5_test_check
 * @param {Array.<Array.<{test_name:String},{state:Boolean}>>} test_state - Array of desired test end states
 * @returns {undefined}
 * @desc Checks the current set of tests[] against a reference set
 */
function f5_test_check(test_state) {
    for (var i in test_state) {
        if(tests[test_state[i][0]] !== test_state[i][1]) {
            f5_set_test_result('[Tester] All Tests Passed', 0, undefined, true);
            if(!parseInt(postman.getGlobalVariable("_f5_enable_polled_mode"),10)) {
                postman.setNextRequest(null);
            }
            return;
        }
    }
    f5_set_test_result('[Tester] All Tests Passed', 1, undefined, true);
    return;
}

/**
 * @function f5_test_state_generate
 * @returns {Undefined}
 * @desc A helper function that generates a final test state array and dumps
 * the text to the console
 */
function f5_test_state_generate() {
    var state_gen = "var test_state = [\n"
    for (var test in tests) {
        state_gen += "\t\t['" + test + "', " + tests[test] + "],\n";
    }
    state_gen += "\t];\n";
    console.log(state_gen);
    return;
}

/**
 * @function f5_search_json
 * @param {Object} json - JSON object to search
 * @param {String} value - String to match to attribute value
 * @param {String} attr - Attribute value to return
 * @param {Number} maxdepth - Max search depth
 * @param {Array} path - Current search path
 * @returns {String|Number|Undefined|Null}
 * @desc A function that recursively searchs a JSON object
 */
function f5_search_json(json, value, attr, maxdepth, path) {
    json = typeof json  === 'undefined' ? {} : json;
    maxdepth = typeof maxdepth  === 'undefined' ? 15 : maxdepth;
    path = typeof path === 'undefined' ? [] : path;
    parenttype = typeof parenttype === 'undefined' ? "" : parenttype;
    depth = path.length || 0;

    if (!value && !attr) {
        f5_debug("nothing to search for, return undefined");
        return undefined;
    }

    var pre = "[" + depth + "]" + " ".repeat(depth);
    f5_debug(pre + "path=" + path)
    if(depth > maxdepth) {
        f5_debug("hit search depth limit, return null")
        return null;
    }

    for(var i in json) {
        f5_debug(pre + "{" + typeof json[i] + "}" + i + "={" + typeof json[i] + "}" + json[i]);

        //var pathtemp = "['" + i + "']";
        var pathtemp = i;

        if (typeof json[i] === 'object') {
            var ret = f5_search_json(json[i], value, attr, maxdepth, path.concat(pathtemp));
            if(ret) { return(ret); }
        } else {
            if((value && attr) && (json[i] === value && attr in json)) {
                f5_debug(pre + " [MATCH 1] value=" + value + " attr=" + attr + " return=" + json[i]);
                return json[attr];
            }
            if((!value && attr) && attr in json) {
                f5_debug(pre + " [MATCH 2] attr=" + attr + " return=" + json[i]);
                return json[attr];
            }
            if((value && !attr) && (json[i] === value)) {
                f5_debug(pre + " [MATCH 3] value=" + value + " return=" + i);
                path.push(pathtemp);
                return path.join('.');
            }
        }
    }
    return undefined;
}

/**
 * @function f5_get_property_by_value
 * @param {Object} json - JSON object to search
 * @param {String} value - String to match in property values
 * @param {String} property - Property value to return
 * @returns {String|Number|Undefined|Null}
 * @desc Search for the first occurence of {value} in {json} and return the
 *       value of the {property} within the same JSON scope
 */
function f5_get_property_by_value(json, value, property) {
    return f5_search_json(json, value, property);
}

/**
 * @function f5_get_first_property_value
 * @param {Object} json - JSON object to search
 * @param {String} property - Property value to return
 * @returns {String|Number|Undefined|Null}
 * @desc Search for first occurence of {property} in {json} and return value
 */
function f5_get_first_property_value(json, property) {
    return f5_search_json(json, undefined, property);
}

/**
 * @function f5_get_path_by_value
 * @param {Object} json - JSON object to search
 * @param {String} value - String to match in property values
 * @returns {String|Undefined|Null}
 * @desc Search for first occurence of {value} in {json} and return the path
 */
function f5_get_path_by_value(json, value) {
    return f5_search_json(json, value, undefined);
}

/**
 * @function f5_parse_json_resp
 * @returns {Object}
 * @desc Safely parse JSON response and cache result in global variable
 */
function f5_parse_json_resp() {
    if(_f5_json === undefined && responseBody) {
        try {
            _f5_json = JSON.parse(responseBody);
            return(_f5_json);
        } catch(e) {
            alert(e); // error in the above string (in this case, yes)!
        }
    }
    return(_f5_json);
}

/**
 * @function f5_get_by_string
 * @param {String} s - Dot-notation path string
 * @param {Number} d - Depth to backup in path (e.g. 1=parent, 2=grandparent)
 * @returns {Object}
 * @desc Return JSON object using a dot-notation path string
 *
 * Credit to http://stackoverflow.com/a/6491621
 */
function f5_get_by_string(s, d) {
    d = typeof d === 'undefined' ? 0 : d;
    o = f5_parse_json_resp();
    if (typeof s !== 'string') {
        return undefined;
    }

    s = s.replace('/\[(\w+)\]/g', '.$1'); // convert indexes to properties
    s = s.replace('/^\./', '');           // strip a leading dot
    s = s.replace(/([^\\])\./g, '$1\u000B'); // handle escaped '.'
    var a = s.split('\u000B');
    f5_debug("a=" + a)
    a = a.splice(0, a.length - d);
    for (var i = 0, n = a.length; i < n; ++i) {
        var k = a[i];
        k = k.replace(/\\\./g, '.');
        if (k in o) {
            o = o[k];
        } else {
            return;
        }
    }
    return o;
}
