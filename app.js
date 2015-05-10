// OAUTH
var OAuth = require('oauth').OAuth
  , oauth = new OAuth(
      "https://api.twitter.com/oauth/request_token",
      "https://api.twitter.com/oauth/access_token",
      "Ria1i9itfX5hRJQlwPCnjz1Ln",
      "RQfqYQYMXhvFqp19j5PX5JA2p3uySMU84PhQAUSShUxPWgb64G",
      "1.0",
      "http://localhost:4444/auth/twitter/callback",
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
    return uuid.v4() // use UUIDs for session IDs
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

// request twitter authorisation
app.get('/auth/twitter', function(req, res) {
 
  oauth.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results) {
    if (error) {
      console.log(error);
      res.send("Authentication Failed!");
    }
    else {
      req.session.oauth = {
        token: oauth_token,
        token_secret: oauth_token_secret
      };
      console.log(req.session.oauth);
      res.redirect('https://twitter.com/oauth/authenticate?oauth_token='+oauth_token)
    }
  });
 
});  

// callback for twitter authorisation
app.get('/auth/twitter/callback', function(req, res, next) {
 
  if (req.session.oauth) {
    req.session.oauth.verifier = req.query.oauth_verifier;
    var oauth_data = req.session.oauth;
 
    oauth.getOAuthAccessToken(
      oauth_data.token,
      oauth_data.token_secret,
      oauth_data.verifier,
      function(error, oauth_access_token, oauth_access_token_secret, tresults) {
        if (error) {
          console.log(error);
          res.send("Authentication Failure!");
        }
        else {
          req.session.oauth.access_token = oauth_access_token;
          req.session.oauth.access_token_secret = oauth_access_token_secret;           


          // authentification successfull
          	r.table('accounts').filter({twitterid: tresults.user_id}).limit(1).run(connection, function(err, cursor) {
			    if (err) throw err;
			    cursor.toArray(function(err, result) {
			    	var answer = {};
			        if (err) throw err;			        
			        if( result.length === 0 ){
			        	r.table('accounts').insert([{ is_admin: false, is_app: false, screen_name: tresults.screen_name, twitterid: tresults.user_id }]).run(connection, function(err, result) {
			        		answer.account_id = result.generated_keys[0];
			        		answer.is_admin = false;
			        		answer.is_app   = false;
			        		answer.screen_name = tresults.screen_name;
			        	});
			        } else {
			        	answer.account_id = result[0].id;
			        	answer.is_admin = result[0].is_admin;
			        	answer.is_app   = result[0].is_app;
			        	answer.screen_name = result[0].screen_name;
			        }

					var token = jwt.sign( answer, 'superdupergeheim2000' );
					if( answer.is_app ){
						res.send( "Your JSON WEB TOKEN is:<br>" + token );	
					} else if( answer.is_admin ){
						res.redirect('http://localhost:3005/#' + token ); 
					} else {
						res.send( "If it would exist, we would redirect you to meerkats.com/#" + token );
						// res.redirect('/'); // You might actually want to redirect!		
					}
					
				
			       
			    });			    
				
		  });          
          
        }
      }
    );
  }
  else {
    res.redirect('/login'); // Redirect to login page
  }
 
});

app.listen(4444);
console.log("Hey, I'm at 4444");
