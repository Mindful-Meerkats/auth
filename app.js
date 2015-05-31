// loading the config
var config = require('./config.json');

// OAUTH
var OAuth = require('oauth').OAuth,
oauth_admin = new OAuth(
      "https://api.twitter.com/oauth/request_token",
      "https://api.twitter.com/oauth/access_token",
      "Ria1i9itfX5hRJQlwPCnjz1Ln",
      "RQfqYQYMXhvFqp19j5PX5JA2p3uySMU84PhQAUSShUxPWgb64G",
      "1.0",
      config.callbackTwitterAdmin,
      "HMAC-SHA1"
    );

oauth_webclient = new OAuth(
      "https://api.twitter.com/oauth/request_token",
      "https://api.twitter.com/oauth/access_token",
      "Ria1i9itfX5hRJQlwPCnjz1Ln",
      "RQfqYQYMXhvFqp19j5PX5JA2p3uySMU84PhQAUSShUxPWgb64G",
      "1.0",
      config.callbackTwitterWebClient,
      "HMAC-SHA1"
    );

oauth_app = new OAuth(
      "https://api.twitter.com/oauth/request_token",
      "https://api.twitter.com/oauth/access_token",
      "Ria1i9itfX5hRJQlwPCnjz1Ln",
      "RQfqYQYMXhvFqp19j5PX5JA2p3uySMU84PhQAUSShUxPWgb64G",
      "1.0",
      config.callbackTwitterApp,
      "HMAC-SHA1"
    );


// EXPRESS
var express = require('express');
var app = express();

// SESSIONS
var session = require('express-session');
var uuid = require('node-uuid');
app.use(session({
  genid: function(req) {
    return uuid.v4(); // use UUIDs for session IDs
  },
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: false
}));

// RETHINKDB
var r = require('rethinkdb');
var connection = null;
r.connect( {host: 'localhost', port: 28015, db: 'development' }, function(err, conn) {
    if (err) throw err;
    connection = conn;
});


// JSON WEB TOKENS
var jwt = require('jsonwebtoken');

var request_twitter_authorisation = function( oauth, req, res ){
  oauth.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results) {
    if (error) {
      res.send("Authentication Failed!");
    }
    else {
      req.session.oauth = {
        token: oauth_token,
        token_secret: oauth_token_secret
      };
      res.redirect('https://twitter.com/oauth/authenticate?oauth_token='+oauth_token);
    }
  });
};

// request twitter authorisation for the webclient
app.get('/webclient/twitter', function(req, res) {
    request_twitter_authorisation( oauth_webclient, req, res );
});

// request twitter authorisation
app.get('/admin/twitter', function(req, res) {
    request_twitter_authorisation( oauth_admin, req, res );
});

// request twitter authorisation
app.get('/app/twitter', function(req, res) {
    request_twitter_authorisation( oauth_app, req, res );
});

var request_twitter_callback = function( ready_url, login_page, oauth, req, res, needsAdmin ){
    if( req.session.oauth ){
        req.session.oauth.verifier = req.query.oauth_verifier;
        var oauth_data = req.session.oauth;
    
        oauth.getOAuthAccessToken(
            oauth_data.token,
            oauth_data.token_secret,
            oauth_data.verifier,
            function( error, oauth_access_token, oauth_access_token_secret, tresults ){
                
                if( error ){
                    console.log(error);
                    res.send("Authentication Failure!");
                    return;
                }
                req.session.oauth.access_token = oauth_access_token;
                req.session.oauth.access_token_secret = oauth_access_token_secret;
        
                // authentification successfull
                r.table('accounts').filter({twitterid: tresults.user_id}).limit(1).run(connection, function( err, cursor ){
        	        if( err ) throw err;
        			    
    			    cursor.toArray( function( err, result ){
    			    	var answer = {};
    			        if (err) throw err;
    			        if( result.length === 0 ){
    			        	r.table('accounts').insert([{ is_admin: false, is_app: false, screen_name: "@" + tresults.screen_name, twitterid: tresults.user_id }]).run(connection, function(err, result) {
    			        		answer.account_id = result.generated_keys[0];
    			        		answer.is_admin = false;
    			        		answer.is_app   = false;
    			        		answer.screen_name = "@" + tresults.screen_name;
    			        	});
    			        } else {
    			        	if( "@" + tresults.screen_name !== result[0].screen_name ){
    			        		r.table('accounts').get( result[0].id ).update({screen_name: "@" + tresults.screen_name }).run( connection, function(err, result){
    			        	  		console.log('updated screen_name');
    			        		});
    			        	}
    			        	answer.account_id = result[0].id;
    			        	answer.is_admin = result[0].is_admin;
    			        	answer.is_app   = result[0].is_app;
    			        	answer.screen_name = "@" + tresults.screen_name;
    			        }
    					var token = jwt.sign( answer, config.privateKey );
    					if( answer.is_app ){ res.json( {"token": token } ); return	} 
    					//if( !answer.is_admin && needsAdmin ){ res.redirect( login_page ); return }
    					res.redirect( ready_url + token );
    					
    			    });
                
    		    });
            
            }
        );
    } else {
        res.redirect( login_page ); // Redirect to login page
    }

};

// callback for twitter authorisation for the admin
app.get('/admin/twitter/callback', function(req, res, next) {
    request_twitter_callback( config.adminUrl, config.adminLoginUrl, oauth_admin, req, res, next, true );
});

// callback for twitter authorisation for the webclient
app.get('/webclient/twitter/callback', function(req, res, next) {
    request_twitter_callback( config.clientUrl, config.clientLoginUrl, oauth_webclient, req, res, next );
});

// callback for twitter authorisation for the webclient
app.get('/app/twitter/callback', function(req, res, next) {
    request_twitter_callback( config.clientUrl, config.AdminLoginUrl, oauth_admin, req, res, next );
});


app.listen(4444);
console.log("Hey, I'm at 4444");
