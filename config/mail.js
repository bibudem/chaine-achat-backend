"use strict";
const nodemailer = require("nodemailer");
const datetime = require("node-datetime");
module.exports = class Mail {
  constructor() {
  }

// async..await is not allowed in global scope, must use a wrapper
 static async mailEnvoyer(courriel,sujet,htmlContenu) {
  // Generate test SMTP service account from ethereal.email
  // Only needed if you don't have a real mail account for testing
  let testAccount = await nodemailer.createTestAccount();

  // create reusable transporter object using the default SMTP transport
  let transporter = nodemailer.createTransport({
    host: "127.0.0.1",
    port: 25,
    secure: false, // true for 465, false for other ports
    /*auth: {
      user: testAccount.user, // generated ethereal user
      pass: testAccount.pass, // generated ethereal password
    },*/
  });

   let meta='<meta http-equiv="content-type" content="text/html; charset=utf-8" />'

  // send mail with defined transport object
  let info = await transporter.sendMail({
    from: '"Matrice des periodiques " <bibsys@bib.umontreal.ca>', // sender address
    to: courriel, // list of receivers
    subject: sujet, // Subject line
    text: "", // plain text body
    html: meta+htmlContenu, // html body
  });

 console.log("Message sent: %s", info.messageId);
  // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

  // Preview only available when sending through an Ethereal account
  console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
  // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...
}

}
