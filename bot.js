require("dotenv").config()
const http = require("http")
const fs = require("fs")
const responses = require("./responses.json")
const roleRequestQueue = []

if (!fs.existsSync("./roles")){
    fs.mkdirSync("./roles");
}

if (!fs.existsSync("./contexts")){
    fs.mkdirSync("./contexts");
}

const TelegramBot = require("node-telegram-bot-api")
const { isObject } = require("util")
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {polling: true})

// Set Role
bot.onText(/^\/setrole/, (message, _) => {
    bot.sendMessage(message.chat.id, responses.en.setrole.describe)
    roleRequestQueue.push(message.chat.id)
})

// Reset Role
bot.onText(/^\/resetrole/, (message, _) => {
    const roleFilepath = "./roles/" + message.chat.id
    fs.unlink(roleFilepath, (error) => {
        if (error) console.log(error)
        bot.sendMessage(message.chat.id, responses.en.resetrole.success)
    })
})

// Receive Context File (.txt)
bot.on("document", (message, _) => {
    if (message.document.mime_type != "text/plain") {
        bot.sendMessage(message.chat.id, responses.en.setcontext.nottxt)
    } else {
        bot.downloadFile(message.document.file_id, "./contexts").then(
            (tmpFilepath) => {
                const contextFilepath = "./contexts/" + message.chat.id
                fs.renameSync(tmpFilepath, contextFilepath)
                bot.sendMessage(message.chat.id, responses.en.setcontext.success)
            },
            (reason) => { console.log(reason) }
        )
    }
})

// Show Context File (.txt)
bot.onText(/^\/showcontext/, (message, _) => {
    const contextFilepath = "./contexts/" + message.chat.id
    fs.readFile(contextFilepath, "utf-8", (error, data) => {
        if (error) {
            console.log(error)
            bot.sendMessage(message.chat.id, responses.en.showcontext.fail)
        }
        else {
            var contextResponse = responses.en.showcontext.success
            if (data.length <= 4000) contextResponse += "\n" + data
            else contextResponse += "\n" + data.substring(0, 1000) + "\n.\n.\n.\n" + data.substring(data.length - 1000, data.length)
            bot.sendMessage(message.chat.id, contextResponse)
        }
    })
})

// Remove Context File (.txt)
bot.onText(/^\/clearcontext/, (message, _) => {
    const contextFilepath = "./contexts/" + message.chat.id
    fs.unlink(contextFilepath, (error) => {
        if (error) console.log(error)
        bot.sendMessage(message.chat.id, responses.en.clearcontext.success)
    })
})

// Regular Messages
bot.onText(/^[^\/].*/, (message, _) => {
    const roleFilepath = "./roles/" + message.chat.id
    const contextFilepath = "./contexts/" + message.chat.id

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
            // Use retrieved response
            var role = process.env.DEFAULT_ROLE
            if (error) {
                console.log(error)
                fs.writeFile(roleFilepath, process.env.DEFAULT_ROLE, () => {})
            }
            else role = data
            
            var prompt = "### Instruction:\n" + role + "\n\n### Human:\n" + message.text + "\n\n### Assistant:\n"
            // Retrieve context
            try {
                const context = fs.readFileSync(contextFilepath, "utf-8")
                prompt = "### Instruction:\n" + role + "\n\n### Context:\n" + context + "\n\n### Human:\n" + message.text + "\n\n### Assistant:\n"
            } catch (contextError) {}

            const promptRequest = JSON.stringify({
                "prompt": prompt,
                "max_new_tokens": 2048,
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
                path: "/v1/completions",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(promptRequest)
                }
            }, (res) => {
                res.on("data", (chunk) => response += chunk)
                res.on("end", () => {
                    const jsonResponse = JSON.parse(response)
                    console.log(jsonResponse)
                    bot.sendMessage(message.chat.id, jsonResponse.choices[0].text)
                })
            })
            req.write(promptRequest)
            req.end()
        })
    }
})