/*-----------------------------------------------------------------------------
A simple Language Understanding (LUIS) bot for the Microsoft Bot Framework.
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");


var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url);
});


var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata
});


server.post('/api/messages', connector.listen());



var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);


var bot = new builder.UniversalBot(connector,function (session) {

   session.send('Welcome To Shopping Cart');


   if (!session.userData.shoppingCartItems) {
       session.userData.shoppingCartItems = {};
       console.log("initializing userData.shoppingCarts in default message handler");
   }

 }

);

bot.set('storage', tableStorage);

// Make sure you add code to validate these fields
var luisAppId = process.env.LuisAppId;
var luisAPIKey = process.env.LuisAPIKey;
var luisAPIHostName = process.env.LuisAPIHostName || 'westus.api.cognitive.microsoft.com';

const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v2.0/apps/' + luisAppId + '?subscription-key=' + luisAPIKey;

// Create a recognizer that gets intents from LUIS, and add it to the bot
var recognizer = new builder.LuisRecognizer(LuisModelUrl);
bot.recognizer(recognizer);

// Add a dialog for each intent that the LUIS app recognizes.
// See https://docs.microsoft.com/en-us/bot-framework/nodejs/bot-builder-nodejs-recognize-intent-luis
bot.dialog('GreetingDialog',
    (session) => {
        session.send('You reached the Greeting intent. You said \'%s\'.', session.message.text);
        session.endDialog();
    }
).triggerAction({
    matches: 'Greeting'
});

//  dialog for Shopping Cart Add
bot.dialog('AddToShoppingCart', [
    function (session, args, next) {
        //  store any shoppingItem entity passed from LUIS.
        var intent = args.intent;
        var shoppingItem = builder.EntityRecognizer.findEntity(intent.entities, 'Shopping.Item');
        var shoppingQuantity=builder.EntityRecognizer.findEntity(intent.entities, 'Shopping.Quantity');

        var shoppingCart = session.dialogData.shoppingCart = {
          shoppingItem: shoppingItem ? shoppingItem.entity : null,
        };

        // ask for shoppingItem
        if (!shoppingCart.shoppingItem) {
            builder.Prompts.text(session, 'Which item you want to shop?');
        } else {
            next();
        }
    },
    function (session, results, next) {
        var shoppingCart = session.dialogData.shoppingCart;
        if (results.response) {
            shoppingCart.shoppingItem = results.response;
        }

        // Prompt for quantity
        if (!shoppingCart.shoppingQuantity) {
            builder.Prompts.text(session, 'What quantity would you like  to buy?');
        } else {
            next();
        }
    },
    function (session, results) {
        var shoppingCart = session.dialogData.shoppingCart;
        if (results.response) {
            shoppingCart.shoppingQuantity = results.response;
        }

        if (!session.userData.shoppingCartItems) {
            session.userData.shoppingCartItems = {};
            console.log("initializing session.userData.shoppingCart in AddToCart dialog");
        }

        session.userData.shoppingCartItems[shoppingCart.shoppingItem] = shoppingCart;

        // Send confirmation to user
        session.endDialog('Creating shoppingcart with item "%s" with quantity of "%s"',
            shoppingCart.shoppingItem, shoppingCart.shoppingQuantity);
    }
]).triggerAction({
    matches: 'Shopping.AddToCart',
    confirmPrompt: "This will cancel the creation of the cart. Are you sure?"
}).cancelAction('cancelAddToCart', "Add To Cart canceled.", {
    matches: /^(cancel)/i,
    confirmPrompt: "Are you sure?"
});
// Delete Items form shopping cart dialog
bot.dialog('RemoveItemsFromCart', [
    function (session, args, next) {
        if (cartItemCount(session.userData.shoppingCartItems) > 0) {
            // Resolve and store shopping entity passed from LUIS.
            var shoppingItem;
            var intent = args.intent;
            var entity = builder.EntityRecognizer.findEntity(intent.entities, 'Shopping.Item');
            if (entity) {

                shoppingItem = builder.EntityRecognizer.findBestMatch(session.userData.shoppingCartItems, entity.entity);
            }

               if (!shoppingItem) {
                builder.Prompts.choice(session, 'Which item would you like to delete?', session.userData.shoppingCartItems);
            } else {
                next({ response: shoppingItem });
            }
        } else {
            session.endDialog("No items to delete.");
        }
    },
    function (session, results) {
        delete session.userData.shoppingCartItems[results.response.entity];
        session.endDialog("Deleted the '%s' item.", results.response.entity);
    }
]).triggerAction({
    matches: 'Shopping.RemoveFromCart'
}).cancelAction('cancelRemoveCar', "Ok - canceled item removal.", {
    matches: /^(cancel)/i
});


// Find item Dialog
bot.dialog('findItem', [
    function (session, args, next) {
        if (cartItemCount(session.userData.shoppingCartItems) > 0) {


            var shoppingItem;
            var intent = args.intent;
            var entity = builder.EntityRecognizer.findEntity(intent.entities, 'Shopping.Item');
            if (entity) {
                // Verify it's in our set of items.
                shoppingItem = builder.EntityRecognizer.findBestMatch(session.userData.shoppingCartItems, entity.entity);
            }


            if (!shoppingItem) {
                builder.Prompts.choice(session, 'Which item would you like to find?', session.userData.shoppingCartItems);
            } else {
                next({ response: shoppingItem });
            }
        } else {
            session.endDialog("No items to find.");
        }
    },
    function (session, results) {
        session.endDialog("Here's the '%s' item: '%s'.", results.response.entity, session.userData.shoppingCartItems[results.response.entity].shoppingItem);
    }
]).triggerAction({
    matches: 'Shopping.FindItem'
}).cancelAction('cancelFindItem', "Ok.", {
    matches: /^(cancel)/i
});


// Utility function to count the number of items stored in user data session

function cartItemCount(items) {

    var i = 0;
    for (var name in items) {
        i++;
    }
    return i;
}
