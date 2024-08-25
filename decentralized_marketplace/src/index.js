const { ethers } = require("ethers");

const rollup_server = process.env.ROLLUP_HTTP_SERVER_URL;
console.log("HTTP rollup_server url is " + rollup_server);

function hex2Object(hex) {
    const utf8String = ethers.toUtf8String(hex);
    return JSON.parse(utf8String);
}

function obj2Hex(obj) {
    const jsonString = JSON.stringify(obj);
    return ethers.hexlify(ethers.toUtf8Bytes(jsonString));
}

let listings = [];
let purchases = [];

// Function to handle marketplace operations
async function handle_advance(data) {
    console.log("Received advance request data " + JSON.stringify(data));

    const metadata = data['metadata'];
    const sender = metadata['msg_sender'];
    const payload = data['payload'];

    let request = hex2Object(payload);

    if (!request.action || !request.details) {
        const report_req = await fetch(rollup_server + "/report", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ payload: obj2Hex("Invalid marketplace request format") }),
        });
        return "reject";
    }

    // Handle different actions
    if (request.action === "create_listing") {
        listings.push({
            id: listings.length + 1,
            seller: sender,
            item: request.details.item,
            price: request.details.price,
            description: request.details.description
        });

        const notice_req = await fetch(rollup_server + "/notice", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ payload: obj2Hex({ message: "Listing created" }) }),
        });

        return "accept";
    } else if (request.action === "purchase_item") {
        const listing = listings.find(l => l.id === request.details.listingId);

        if (listing) {
            purchases.push({
                buyer: sender,
                listingId: listing.id
            });

            const notice_req = await fetch(rollup_server + "/notice", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ payload: obj2Hex({ message: "Item purchased" }) }),
            });

            return "accept";
        } else {
            const report_req = await fetch(rollup_server + "/report", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ payload: obj2Hex("Listing not found") }),
            });

            return "reject";
        }
    }

    return "reject";
}

// Function to handle inspection requests
async function handle_inspect(data) {
    console.log("Received inspect request data " + JSON.stringify(data));

    const payload = data['payload'];
    const route = ethers.toUtf8String(payload);

    let responseObject = {};
    if (route === "listings") {
        responseObject = JSON.stringify({ listings });
    } else if (route === "purchases") {
        responseObject = JSON.stringify({ purchases });
    } else {
        responseObject = "route not implemented";
    }

    const report_req = await fetch(rollup_server + "/report", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ payload: obj2Hex(responseObject) }),
    });

    return "accept";
}

const handlers = {
    advance_state: handle_advance,
    inspect_state: handle_inspect,
};

const finish = { status: "accept" };

(async () => {
    while (true) {
        const finish_req = await fetch(rollup_server + "/finish", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ status: "accept" }),
        });

        console.log("Received finish status " + finish_req.status);

        if (finish_req.status == 202) {
            console.log("No pending rollup request, trying again");
        } else {
            const rollup_req = await finish_req.json();
            const handler = handlers[rollup_req["request_type"]];
            finish["status"] = await handler(rollup_req["data"]);
        }
    }
})();
