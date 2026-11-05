# Case sheet: AML alert queue

**All data is synthetic.** Lysbro Pay ApS (fictional) and its customers are invented.

## Problem

A payment company has to watch transfers for money laundering. Rules flag behaviour that looks suspicious. Analysts then read every case and decide what to escalate. I wanted to see if AI could draft that case note without inventing anything.

## Approach

I generated 2.000 fictional customers and planted 30 suspicious ones in six patterns. Six rules in SQL turn transfers into alerts and cases. For each of the 183 cases, Claude drafts a short note and suggests escalate or close. A script without AI checks every number and date in the draft. I wrote down how I would measure the result before the AI ran.

## Findings

Most cases are false positives: 149 of 183. Two rules make most of them. The volume-spike rule fires on car purchases and bonuses, and the corridor rule fires on ordinary family support abroad.

The rules caught 27 of the 30 planted customers. The three misses were weak versions built to sit just under a threshold.

The AI rarely misses a truly suspicious case. It suggested escalating 30 of 34. But it would only close 79 of 149 false positives, so it halves part of the workload at most. If an analyst only read the cases the AI flags, they would review 100 of 183 cases and miss 4 real ones. In AML a missed case costs more than a false positive, so the AI should order the queue, not close cases.

The fairness check showed the same name-origin mix among planted customers as among everyone else. The AI never sees names.

## What I learned

The first launch failed on a compression bug. The second crashed after 11 cases on a bug in my script. I archived those drafts unread, fixed the script and ran everything once with the same prompt, checks and cost cap. It still counts as one run because nothing I saw could change the prompt. Writing the metrics down first is what made the result believable.
