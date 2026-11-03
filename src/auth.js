import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { mongodbAdapter } from "@better-auth/mongo-adapter";
import nodemailer from "nodemailer";

export function createAuth(db, client) {
  const mailer = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  return betterAuth({
    database: mongodbAdapter(db, { client }),
    trustedOrigins: [process.env.CLIENT_URL],

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 1800,

      async sendResetPassword({ user, url }) {
        const link = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

        const message = {
          from: { name: "StudioSpace", address: process.env.GMAIL_USER },
          to: user.email,
          subject: "Reset your StudioSpace password",
          text: [
            "Choose a new StudioSpace password",
            "",
            "Use the link below within 30 minutes to set your new password.",
            url,
            "",
            "If you didn't request this change, you can ignore this email.",
          ].join("\n"),
          html: `
            <div style="padding:24px 12px;background:#f5f3ed;color:#25241f;font-family:Arial,sans-serif;">
              <div style="max-width:460px;margin:0 auto;padding:28px 24px;background:#fffefa;border:1px solid #dedbd2;">
                <p style="margin:0 0 28px;font: bold 21px Georgia,serif;">StudioSpace</p>

                <h1 style="margin:0 0 12px;font:normal 32px/1.15 Georgia,serif;">
                  Reset your password
                </h1>

                <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#514f47;">
                  Someone requested a password reset for your StudioSpace account.
                  Use the button below within 30 minutes to choose a new password.
                </p>

                <a href="${link}" style="display:inline-block;padding:13px 20px;background:#25241f;color:#ffffff;text-decoration:none;border-radius:3px;font-size:14px;font-weight:bold;">
                  Choose a new password
                </a>

                <p style="margin:26px 0 0;padding-top:16px;border-top:1px solid #dedbd2;font-size:13px;line-height:1.6;color:#66635b;">
                  Didn't request this? You can ignore this email.
                  Your current password will still work.
                </p>
              </div>
            </div>
          `,
        };

        void mailer.sendMail(message).catch((error) => {
          console.error("StudioSpace reset email failed:", error.code);
        });
      },
    },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        let password;

        if (ctx.path === "/sign-up/email") {
          password = ctx.body?.password;
        } else if (ctx.path === "/reset-password") {
          password = ctx.body?.newPassword;
        } else {
          return;
        }

        if (
          typeof password !== "string" ||
          password.length < 6 ||
          !/[A-Z]/.test(password) ||
          !/[a-z]/.test(password)
        ) {
          throw new APIError("BAD_REQUEST", {
            message:
              "Use at least 6 characters with an uppercase and a lowercase letter.",
          });
        }
      }),
    },
  });
}
