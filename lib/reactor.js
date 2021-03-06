var nitrogen = require('nitrogen')
  , cli = require('../lib');

var help = function(callback) {
    cli.utils.displayCommands('App Commands', [
        ['install <reactor_id> <instance_id> <module_name>', 'Install app into reactor instance.'],
        ['',              '  --version: version of the module to install (default: latest).'],
        ['',              '  --executeAs: principal to execute this application as (default: user).'],
        ['',              '  (eg. n2 app install \'Raspberry Pi\' rpi-camera)'],
        ['start <reactor_id> <instance_id> [params]', 'Start app in reactor instance.'],
        ['',              '  (eg. n2 app start \'Cloud Reactor\' timelapse \'{"camera_id":"53c6e7e9bcd5547704409700"}\')'],
        ['state <reactor_id>', 'Display current state of instances in a reactor.'],
        ['stop <reactor_id> <instance_id>', 'Stop app instance in reactor.'],
        ['uninstall <reactor_id> <instance_id>', 'Uninstall app instance from reactor.']
    ]);

    return callback();
};

var install = function(callback) {
    cli.principal.resolvePrincipalId(cli.nextArgument(), function(err, reactorId) {
        if (err) return help(callback);
        if (!reactorId) return help(callback);

        var instanceId = String(cli.nextArgument());
        if (!instanceId) return help(callback);

        var module = cli.nextArgument();

        // if there is no module, assume the previous argument was boththe module and
        // instance name.

        if (!module) {
            module = instanceId;
        }

        cli.globals.startSession(function(err, session, user) {
            if (err) return callback(err);

            var executeAs = user.id;
            if (cli.flags.executeAs)
                executeAs = cli.flags.executeAs;

            cli.principal.resolvePrincipalId(executeAs, function(err, executeAsId) {
                if (err) return help(callback);

                var version;
                if (cli.flags.version)
                    version = cli.flags.version;

                var installMsg = new nitrogen.Message({
                    to: reactorId,
                    type: 'reactorCommand',
                    tags: [ nitrogen.CommandManager.commandTag(reactorId) ],
                    body: {
                        command: 'install',
                        execute_as: executeAsId,
                        instance_id: instanceId,
                        module: module,
                        version: version
                    }
                });

                cli.log.info('sending install command for module: ' + module + ' to instance: ' + instanceId);

                installMsg.send(session, function(err, message) {
                    var permission = new nitrogen.Permission({
                        action: 'impersonate',
                        issued_to: reactorId,
                        principal_for: executeAsId,
                        priority: nitrogen.Permission.NORMAL_PRIORITY,
                        authorized: true
                    });

                    permission.create(session, callback);
                });
            });
        });
    });
};

var sendInstanceCommand = function(action, callback) {
    cli.principal.resolvePrincipalId(cli.nextArgument(), function(err, reactorId) {
        if (err) return help(callback);
        if (!reactorId) return help(callback);

        var instanceId = String(cli.nextArgument());
        if (!instanceId) return help(callback);

        cli.globals.startSession(function(err, session, user) {
            var msg = new nitrogen.Message({
                to: reactorId,
                type: 'reactorCommand',
                tags: [ nitrogen.CommandManager.commandTag(reactorId) ],
                body: {
                    command: action,
                    instance_id: instanceId
                }
            });

            var params = cli.nextArgument();
            if (params) {
                msg.body.params = JSON.parse(params);
            }

            msg.send(session, callback);
        });
    });
};

var start = function(callback) {
    return sendInstanceCommand('start', callback);
};

var state = function(callback) {
    cli.principal.resolvePrincipalId(cli.nextArgument(), function(err, reactorId) {
        if (err) return help(callback);
        if (!reactorId) return help(callback);

        cli.globals.startSession(function(err, session, user) {
            if (err) return callback(err);

            nitrogen.Message.find(session, { type: 'reactorState', from: reactorId },
                { ts: -1, limit: 1 } , function(err, messages) {

                if (err) return callback(err);

                if (messages.length === 0) {
                    cli.log.info("couldn't find any reactor state messages for " + reactorId);
                    return callback();
                }

                var state = messages[0].body.state;

                cli.log.info('Reactor state as of ' + messages[0].ts);

                var widths = [20, 11, 20 , 10, 25, 17];
                var columns = ['INSTANCE','STATE', 'MODULE', 'VERSION', 'EXECUTE AS', 'PARAMS'];
                cli.log.info(cli.utils.prettyPrint(columns, widths));

                if (!state || Object.keys(state).length === 0) {
                    cli.log.info("(nothing installed)");
                    return callback();
                }

                Object.keys(state).forEach(function(instanceId) {
                    var columns = [
                        instanceId,
                        state[instanceId].state,
                        state[instanceId].module,
                        state[instanceId].version || "",
                        state[instanceId].execute_as,
                        state[instanceId].params || ""
                    ];

                    cli.log.info(cli.utils.prettyPrint(columns, widths));
                });

                return callback();
            });
        });
    });
};

var stop = function(callback) {
    return sendInstanceCommand('stop', callback);
};

var uninstall = function(callback) {
    return sendInstanceCommand('uninstall', callback);
};

module.exports.execute = function(callback) {
    var command = cli.nextArgument();
    switch(command) {
        case 'help': {
            help(callback);
            break;
        }

        case 'install': {
            install(callback);
            break;
        }

        case 'start' : {
            start(callback);
            break;
        }

        case 'state' : {
            state(callback);
            break;
        }

        case 'stop' : {
            stop(callback);
            break;
        }

        case 'uninstall' : {
            uninstall(callback);
            break;
        }

        default: {
            cli.log.error('unknown reactor command: ' + command);
            help(callback);
            break;
        }
    }
};