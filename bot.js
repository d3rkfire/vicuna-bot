require("dotenv").config()
const http = require("http")
const fs = require("fs")
const responses = require("./responses.json")
const roleRequestQueue = []

if (!fs.existsSync("./roles")){
    fs.mkdirSync("./roles");
}

const TelegramBot = require("node-telegram-bot-api")
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {polling: true})

// Set Role
bot.onText(/^\/setrole$/, (message, _) => {
    bot.sendMessage(message.chat.id, responses.en.setrole.describe)
    roleRequestQueue.push(message.chat.id)
})
bot.onText(/^\/setrole (.+)$/, (message, match) => {
    const roleDescription = match[1].replace(/^\"/, "").replace(/\"$/, "")
    const roleFilepath = "./roles/" + message.chat.id
    fs.writeFile(roleFilepath, roleDescription, (error) => {
        if (error) {
            console.log(error)
            bot.sendMessage(message.chat.id, responses.en.setrole.fail)
        } else {
            const response = responses.en.setrole.success + roleDescription
            bot.sendMessage(message.chat.id, response)
        }
        roleRequestQueue.splice(roleRequestQueue.indexOf(message.chat.id), 1)
    })
})

// Reset Role
bot.onText(/^\/resetrole$/, (message, _) => {
    const roleFilepath = "./roles/" + message.chat.id
    fs.unlink(roleFilepath, (error) => {
        if (error) console.log(error)
        bot.sendMessage(message.chat.id, responses.en.resetrole.success)
    })
})

// Regular Messages
bot.onText(/^[^\/].*/, (message, _) => {
    const roleFilepath = "./roles/" + message.chat.id

    // Check if chat is requesting /setrole
    if (roleRequestQueue.indexOf(message.chat.id) != -1) {
        // Chat requested /setrole
        const roleDescription = message.text.replace(/^\"/, "").replace(/\"$/, "")
        fs.writeFile(roleFilepath, roleDescription, (error) => {
            if (error) {
                console.log(error)
                bot.sendMessage(message.chat.id, responses.en.setrole.fail)
            } else {
                const response = responses.en.setrole.success + roleDescription
                bot.sendMessage(message.chat.id, response)
            }
            roleRequestQueue.splice(roleRequestQueue.indexOf(message.chat.id), 1)
        })
    } else {
        // Chat did not request /setrole
        fs.readFile(roleFilepath, "utf-8", (error, data) => {
            var role = process.env.DEFAULT_ROLE
            if (error) console.log(error)
            else role = data
            
            const promptRequest = JSON.stringify({
                "prompt": "### Instruction:\n" + role + "\n\n### Human:\n" + message.text + "\n\n### Assistant:\n",
                "max_new_tokens": 1024,
                "temparature": 0.7,
                "repetition_penalty": 1.2,
                "min_length": 10,
                "do_sample": true,
                "add_bos_token": false,
                "stopping_strings": ["### Human:", "### Assistant:"]
            })

            var response = ""
            const req = http.request({
                host: process.env.API_HOST,
                port: process.env.API_PORT,
                path: "/api/v1/generate",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(promptRequest)
                }
            }, (res) => {
                res.on("data", (chunk) => response += chunk)
                res.on("end", () => {
                    const jsonResponse = JSON.parse(response)
                    bot.sendMessage(message.chat.id, jsonResponse.results[0].text)
                })
            })
            req.write(promptRequest)
            req.end()
        })
    }
})