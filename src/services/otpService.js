const { configDotenv } = require("dotenv");
var unirest = require("unirest");

// Error code map for Fast2SMS
const fast2smsErrorMap = {
  401: "Sender ID Missing",
  402: "Message Text Missing",
  403: "Route Missing",
  404: "Language Missing",
  405: "Numbers Missing",
  406: "Invalid Sender ID",
  407: "Invalid words used in message",
  408: "Invalid Route",
  409: "Invalid Route Authentication",
  410: "Invalid Language",
  411: "Invalid Phone-Number",
  412: "Invalid Authentication, Check Authorization Key",
  413: "Invalid Authentication, Authorization Key Disabled",
  414: "IP is blacklisted from Dev API section",
  415: "Account Disabled",
  416: "You don't have sufficient wallet balance",
  417: "Use english letters or change language to unicode",
  424: "Invalid Message ID",
  425: "Invalid Template",
  426: "Invalid link used in variables",
  500: "Template/Sender id blacklisted at DLT",
  990: "You're hitting old API. Refer updated documentation",
  995: "Spamming detected (sending multiple sms to same number is not allowed)",
  996: "Before using OTP SMS API, complete KYC here.",
  997: "Only numeric variables_values is allowed in OTP route",
  998: "Use DLT or Quick SMS route for sending Bulk SMS",
  999: "Complete single transaction of minimum 100 INR in Fast2SMS wallet before using API",
  900:"Server error"
};
const sendOTP = async (phoneNumber, otp) => {
  console.log(process.env.FAST_SMS_API);
  console.log(`Sending OTP ${otp} to ${phoneNumber}`);

  return new Promise((resolve, reject) => {
    var req = unirest("GET", "https://www.fast2sms.com/dev/bulkV2");

    req.query({
      "authorization": process.env.FAST_SMS_API,
      "variables_values": otp,
      "route": 'dlt',
      "sender_id": 'ELNTER',
      "message": 185903,
      "flash": 0,
      "numbers": `${phoneNumber}`
    });

    req.headers({ "cache-control": "no-cache" });

    req.end(function (res) {
      if (res.error) {
        console.error("Request error:", res.body);
        const statuscode = res.body.status_code||900;
        return reject({ status: 'error', message: `Failed to send OTP, Error: ${fast2smsErrorMap[statuscode]}` });
      }

      const { return: success, statusCode, message } = res.body;
      if (!success && fast2smsErrorMap[statusCode]) {
        console.error(`Fast2SMS Error (${statusCode}): ${fast2smsErrorMap[statusCode]}`);
        return reject({ status: 'error', message: fast2smsErrorMap[statusCode] });
      }

      console.log("Fast2SMS Response:"+ res.body);
      resolve({ status: 'success', message: 'OTP sent successfully' });
    });
  });
};
module.exports = sendOTP;