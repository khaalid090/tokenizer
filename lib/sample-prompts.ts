export interface SamplePrompt {
  id: string;
  title: string;
  category: "Code Review" | "Data Analysis" | "System Architecture" | "Creative / Fluff";
  expectedSavings: string;
  prompt: string;
}

export const SAMPLE_PROMPTS: SamplePrompt[] = [
  {
    id: "code-review",
    title: "Verbose Python Code Review (30-35% savings)",
    category: "Code Review",
    expectedSavings: "30-35%",
    prompt: `Hello there! I hope you are having a wonderful day today. Could you please kindly take a look at my code snippet below and give me some detailed feedback? I am really hoping to make sure that it runs efficiently and doesn't run into performance bottlenecks. As a matter of fact, it would be wonderful if you could also check for security flaws.

Here is the exact code block that I want you to inspect:
\`\`\`python
def process_user_data(users):
    results = []
    for user in users:
        if user.get("status") == "active":
            results.append({"id": user["id"], "score": user["points"] * 1.5})
    return results
\`\`\`

You must never expose the raw user object in the returned results.
The function must return at least 1 record if active users exist.
Do not import any third-party external libraries like pandas or numpy.
Please explain in great detail and provide a very thorough analysis with comprehensive explanations. Thanks so much for your help!`,
  },
  {
    id: "system-architecture",
    title: "Enterprise Architecture Query (30-35% savings)",
    category: "System Architecture",
    expectedSavings: "30-35%",
    prompt: `Good morning! I was wondering if you could possibly help me design a cloud infrastructure on AWS for our new product launch on 2026-11-15. In my humble opinion, scalability is super crucial. 

Basically, what we need is an architecture diagram and configuration description. We need an API gateway that routes traffic to Lambda functions, and we need an RDS PostgreSQL cluster for storing transaction records.
We need an API gateway that routes traffic to Lambda functions, and we need an RDS PostgreSQL cluster for storing transaction records.

The system must handle at least 50,000 requests per second.
The API response latency must always remain under 120ms.
You must never use unencrypted S3 buckets.
Only use Terraform for infrastructure as code.
Config path must be \`/etc/cloud/prod.conf\`.

Could you kindly walk me through the entire thought process step by step and give an exhaustive summary? Thank you kindly!`,
  },
  {
    id: "data-analysis",
    title: "SQL Data Pipeline Analysis (15-25% savings)",
    category: "Data Analysis",
    expectedSavings: "15-25%",
    prompt: `Hi AI assistant! Could you please help me write an analytical SQL query for our analytics database? If it is not too much trouble, please analyze customer retention.

We have a table called \`customer_events\` with columns \`event_id\`, \`user_id\`, \`event_timestamp\`, and \`revenue\`.
Please help me calculate 30-day retention and total revenue per cohort.
Please help me calculate 30-day retention and total revenue per cohort.

The query must run in BigQuery SQL standard dialect.
Do not use legacy SQL syntax.
The final output must only include cohorts from 2026-01-01 onwards.
Provide the query in SQL format. Please be very descriptive and write lots of commentary explaining everything in thorough detail.`,
  },
];
