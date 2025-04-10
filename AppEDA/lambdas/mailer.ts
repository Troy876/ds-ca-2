import { DynamoDBStreamHandler } from "aws-lambda";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
    throw new Error(
        "Please add the SES_EMAIL_TO, SES_EMAIL_FROM and SES_REGION environment variables in an env.js file located in the root directory"
    );
}

const client = new SESClient({ region: SES_REGION });

export const handler: DynamoDBStreamHandler = async (event) => {
    console.log("Event:", JSON.stringify(event, null, 2));
    for (const record of event.Records) {
        if (record.eventName !== "MODIFY") continue;
        const newImage = record.dynamodb?.NewImage;
        const oldImage = record.dynamodb?.OldImage;
        const oldStatus = oldImage?.status?.S;
        const newStatus = newImage?.status?.S;
        if (newStatus && oldStatus !== newStatus) {
            const imageId = newImage.id?.S;
            const reason = newImage.reason?.S || "No reason provided";
            const emailParams = buildEmailParams({
                email: SES_EMAIL_FROM,
                subject: `Image Status Update: ${newStatus}`,
                message: `Image ${imageId} has been reviewed.<br/>Status: <b>${newStatus}</b>Reason: ${reason}`,
            });
            try {
                await client.send(new SendEmailCommand(emailParams));
                console.log(`Sent ${imageId} ${newStatus}`);
            } catch (error) {
                console.error("Error:", error);
            }
        }
    }
}

type EmailContent = {
    email: string;
    subject: string;
    message: string;
}

function buildEmailParams({email, subject, message }: EmailContent): SendEmailCommandInput {
    return {
        Destination: {
            ToAddresses: [SES_EMAIL_TO],
        },
        Message: {
            Body: {
                Html: {
                    Charset: "UTF-8",
                    Data: getHtmlContent({ email, message }),
                },
            },
            Subject: {
                Charset: "UTF-8",
                Data: subject,
            },
        },
        Source: SES_EMAIL_FROM,
    };
}

function getHtmlContent({email, message }: Pick<EmailContent,"email" | "message">): string {
    return `
    <html>
      <body>
        <h2>Status Update Notification</h2>
        <p><b>From:</b> ${email}</p>
        <hr />
        <div>${message}</div>
      </body>
    </html>
  `;
}
