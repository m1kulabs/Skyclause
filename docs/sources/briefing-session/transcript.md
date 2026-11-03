# Briefing session transcript

The problem statement briefing and Gemini Enterprise training for the APU Cloud Innovation Hackathon 2026, run by NTT DATA on Google Meet on 3 November 2026. Transcribed from `briefing-session.mp4` (2 hours 5 minutes) in the organizers' [Google Drive folder][drive], captured on 3 November 2026. The slides shown are in [Briefing session slides](slides.md).

Contents:

1.  [About this transcript](#about-this-transcript)
1.  [Speakers](#speakers)
1.  [Q&A](#qa)
    1.  [Questions asked by voice or read from the chat](#questions-asked-by-voice-or-read-from-the-chat)
    1.  [In-call chat](#in-call-chat)
1.  [Transcript](#transcript)
    1.  [Before the session](#before-the-session)
    1.  [Introduction and agenda](#introduction-and-agenda)
    1.  [Team introduction](#team-introduction)
    1.  [Hackathon briefing](#hackathon-briefing)
    1.  [Google Cloud basics](#google-cloud-basics)
    1.  [Gemini Enterprise demo](#gemini-enterprise-demo)
    1.  [Gemini Enterprise recap](#gemini-enterprise-recap)
    1.  [Google Antigravity](#google-antigravity)
    1.  [Antigravity and connector demo](#antigravity-and-connector-demo)
    1.  [Antigravity recap](#antigravity-recap)
    1.  [Hackathon tracks and deliverables](#hackathon-tracks-and-deliverables)
    1.  [Questions and answers](#questions-and-answers)
    1.  [Closing](#closing)
1.  [See also](#see-also)

[drive]: https://drive.google.com/drive/folders/1-NCJcE80LqnsgYKGdcCmralFJbUDG0m-

## About this transcript

- **Recording:** a screen recording of the Google Meet call from an attendee's browser. The recording starts at about 5:41 PM Malaysia time (MYT). The session starts at 0:24:43 (about 6:05 PM) and the host ends the call at about 2:04:05 (about 7:45 PM).
- **Timestamps:** `[h:mm:ss]` marks are positions in the recording, not clock time.
- **Method:** speech was transcribed with ElevenLabs Scribe v2 with speaker separation. Speakers were named from the Meet tile labels, the active-speaker indicator, and what they said. Filler words such as "uh" and "um" were removed. Names and products misheard by the transcription were corrected against the slides, for example NTT, Sushanth Shetty, Eelyn, Nabila, Supabase, NotebookLM, and MCP server. Everything else is as transcribed, so expect some misheard words.
- **Marcus:** a hackathon organizer the presenters mention often; he did not speak in the recording.
- **Privacy:** participants are not named, matching the [Discord captures](/docs/sources/discord.com/apu-cloud-innovation-hackathon-discord.md).

## Speakers

| Speaker              | Role                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deepanraj Vellingiri | NTT DATA. Listed as FDE on the team slide; introduced himself as a senior solution architect focused on Google Cloud. Led the session and Gemini Enterprise demo. |
| Sushanth Shetty      | NTT DATA, FDE. Presented Google Antigravity until a connection issue on his laptop, then answered in the chat.                                                    |
| Cindy Pua            | Hackathon organizer. Started the session and relayed participants' questions.                                                                                     |
| Participant A        | Participant who asked about console access and judging criteria.                                                                                                  |
| Participant B        | Participant who asked about a free-trial prompt in the Google Cloud console.                                                                                      |
| Participant          | Unidentified attendees in the closing.                                                                                                                            |

## Q&A

### Questions asked by voice or read from the chat

Answers are summarized; the full wording is in the [transcript](#transcript).

1.  **What are the deliverables for each track?** Asked by Cindy Pua for participants at 1:37:24. Deepanraj walked through the three challenge tracks with example ideas, then asked teams to cover five things: the existing problem, how they solve it, their research, how the team worked, and the impact or outcome. He asked for these in the Git repository and a three-to-four-minute video (1:37:58 to 1:47:46). Earlier, at 0:30:36, he had described the submission as a ten-minute video or a report in Git.
1.  **Where do we attach our project?** Read from the chat at 1:48:03. Use GitHub: put diagrams, the problem statement as slides or a PDF (NotebookLM can generate slides), and a README explaining what you did, how, and the expected impact.
1.  **How can we access the recording of the meeting?** Read from the chat at 1:48:52. Cindy and Marcus will send it.
1.  **Must we highlight where teammates used AI?** Read from the chat at 1:49:11. More than where teammates used AI, he wants the outcome and where the solution fits, such as an operations team or students.
1.  **Is using Gemini mandatory?** Read from the chat at 1:49:35. Yes, Gemini Enterprise is mandatory. Sushanth gave the same answer in the chat.
1.  **Is a website expected, since a website link is a submission requirement?** Read from the chat at 1:50:28. Deepanraj said the organizers will invite reviewers such as himself or Sushanth to a team's Gemini Enterprise app to look at the project, and that app's URL is specific to the project, not public.
1.  **How do we access Gemini Enterprise and Antigravity in full?** Read from the chat at 1:51:17. Google sponsors a Gemini Enterprise trial license for the hackathon with no limitation. Open Gemini Enterprise from the Google Cloud console, create an application, and enable chat agents and workflows in its configuration. For Antigravity, sign in with the account the license is allocated to.
1.  **I didn't understand where to attach our project.** A follow-up in the chat, answered at 1:52:35. Code is not required because Gemini Enterprise is low-code. Create slides, a PDF, or Google Slides, put them in a GitHub repository (public or not is up to you), and add a structured README covering how you built it, the problem, the solution, the impact, the teamwork, and the research.
1.  **How do we access the console link you are showing?** Participant A at 1:53:44. Go to `console.cloud.google.com`, sign in with the university account (or the personal account the license was allocated to), and search for Gemini Enterprise. Deepanraj posted the link in the chat.
1.  **Will we be given access?** Participant A at 1:54:36. Yes, through a Gemini Enterprise license per person or per team; Google handles allocation, so ask Marcus or Cindy.
1.  **What are the judging criteria?** Participant A at 1:55:01. An NTT DATA team will review and rate projects on how the solution affects students, the university, or operations; the connectors used; the research; how soon the impact arrives; and, for automated workflows, how they work day to day. 1P and 3P connectors are the main technical focus, with MCP as an add-on.
1.  **Is using Google a must?** Participant A at 1:56:28. Yes. Everything should be built with Gemini Enterprise and Antigravity, with agents built inside Gemini Enterprise.
1.  **Submission requirements.** Cindy Pua at 1:57:17 said the requirements are already listed on Discord and the website: a GitHub repository link, slides, and a demo link.
1.  **The Google Cloud console asks me to start a free trial or buy credits.** Participant B at 1:58:04. Deepanraj wasn't sure whether the license had been allocated; without it there is no access. Licenses are sponsored by Google, so ask Cindy or Marcus.
1.  **Further access questions.** At 1:59:30, Deepanraj asked participants to send them to Cindy or Marcus, who will remove duplicates and forward them to NTT DATA.
1.  **A last chat question about Gemini Enterprise.** Read at 2:00:20; the question isn't visible in the recording. Gemini Enterprise is an agentic chatbot. Use Antigravity to help connect 1P, 3P, and MCP connectors. Gemini Enterprise is mandatory and Antigravity is a supporting tool.

The deliverables described in the briefing (a README covering five points and a short video) differ from the [website's submission requirements](/docs/sources/gdgocapu.com/event-details.md#submissions); Cindy Pua pointed participants to the website and Discord list.

### In-call chat

The chat messages visible in the recording, from 7:25 PM MYT onward. Earlier messages were scrolled out of view. Participant names are removed.

| Time (MYT) | Sender               | Message                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7:25 PM    | Sushanth Shetty      | yes                                                                                                                                                                                                                                                                                                                                                                             |
| 7:29 PM    | Participant          | How can we access the recording of the meeting?                                                                                                                                                                                                                                                                                                                                 |
| 7:29 PM    | Participant          | About ai, must we highlight places where my teammates use ai?                                                                                                                                                                                                                                                                                                                   |
| 7:30 PM    | Participant          | Using gemeni is mandatory then?                                                                                                                                                                                                                                                                                                                                                 |
| 7:30 PM    | Sushanth Shetty      | Gemini Enterprise is mandatory                                                                                                                                                                                                                                                                                                                                                  |
| 7:31 PM    | Participant          | is a website along with our solution expected? A website link was listed as one of the submission requirements                                                                                                                                                                                                                                                                  |
| 7:31 PM    | Participant          | How will we be able to access Gemini Enterprise and Antigravity in their full capacity?                                                                                                                                                                                                                                                                                         |
| 7:31 PM    | Participant          | I didnt understand really well, where will we have attach our project?                                                                                                                                                                                                                                                                                                          |
| 7:31 PM    | Cindy Pua            | You can use GitHub to manage and store your code. When submissions open, you'll need to submit your GitHub repository link along with your deployed app or website link through our official hackathon submission portal. We'll share the submission link and further instructions in our Discord server once submissions are open, so do keep an eye out for updates there! 💙 |
| 7:34 PM    | Sushanth Shetty      | @[participant] - if your idea needs github you add add references code documents or code in github and share it with us                                                                                                                                                                                                                                                         |
| 7:35 PM    | Deepanraj Vellingiri | https://console.cloud.google.com/                                                                                                                                                                                                                                                                                                                                               |
| 7:35 PM    | Deepanraj Vellingiri | A second message, out of view in the recording.                                                                                                                                                                                                                                                                                                                                 |

## Transcript

### Before the session

**[0:19:56] Deepanraj Vellingiri:** Okay.

**[0:20:16] Deepanraj Vellingiri:** Hi, everyone. Good evening.

**[0:20:24] Cindy Pua:** Hello, Deepak.

**[0:20:40] Deepanraj Vellingiri:** So we will wait for a couple of minutes for the other students to join. Is Marcus on call?

**[0:20:50] Deepanraj Vellingiri:** Or Cindy?

**[0:21:03] Cindy Pua:** Yep. Yeah, Cindy is here.

**[0:21:15] Cindy Pua:** Yeah.

**[0:21:43] Deepanraj Vellingiri:** Hey, Cindy, let me know when we can start it.

**[0:21:48] Cindy Pua:** All right. Maybe we can start like, six zero five.

**[0:21:53] Deepanraj Vellingiri:** Sure.

**[0:21:55] Cindy Pua:** Or six ten. Yeah.

**[0:21:58] Deepanraj Vellingiri:** Okay.

**[0:22:00] Deepanraj Vellingiri:** Just give me an intimation so that I can start presenting.

**[0:22:07] Cindy Pua:** All right.

**[0:24:43] Cindy Pua:** Hi, I think we can start.

### Introduction and agenda

**[0:24:46] Deepanraj Vellingiri:** Yep. Okay.

**[0:24:52] Deepanraj Vellingiri:** Okay, we'll start sharing screen. Okay. Hi, everyone. Thanks for joining this session.

**[0:25:00] Deepanraj Vellingiri:** I guess my screen is up.

**[0:25:13] Deepanraj Vellingiri:** Okay. So myself, Deepan. I am from NTT. I work as a senior solution architect. I specifically focus on Google Cloud. So coming to this workshop enablement session. So this is purely based on Gemini Enterprise and Google Antigravity. So what exactly we are going to deliver today is: So first major is like a workshop overview and what we are going to cover it, and also about NTT and just I have a beautiful team over here. I'm going to give intro about it. Then moving towards the hackathon briefing and then basics of Google Cloud and Gemini Enterprise overview, and then hands-on completely how you can leverage the Gemini Enterprise and also the Google Antigravity. And post that, we'll be having a Q&A at the end of the session.

**[0:26:01] Deepanraj Vellingiri:** So basically, you might aware about the workshop overview, right? So what exactly we are trying to bring over here is like to make you understand more around the Google Cloud basics so that you can leverage Google Cloud for your future benefits as well. Once you're onboarded into any organization or you want to become an entrepreneur, you can build a Google Cloud solution as well. Whether it might be a SaaS-based solution or it might be an AI-based solution. Or also when it comes to entrepreneurship, you can bring your machine learning ideas into the real-time world example. So for that, Gemini Enterprise plays a major market role, in deep research and machine learning model as well. Which is a simpler, easy to plug in and plug out. And also it's not a complex, it's like a low-code, no-code platform.

**[0:26:47] Deepanraj Vellingiri:** And to make it live, you need a IDE tool where you won't be using the framework like Java or Python, which is currently it's complex. Where you might been seeing the competitors others like Claude or even OpenAI, but Google Antigravity sits on top of it. What exactly it does is like, it not only gives you the use case ideas, it also generates the framework and easy to deploy it. So this makes your time, this conception time. And also when it comes to deployment, making it live also straightforward and easier. So how to execute it, we'll be training today.

**[0:27:27] Deepanraj Vellingiri:** So you might heard about NTT. I guess so. So we are the major data center provider, and we are also Google Cloud service partner, premium partner, where we have, like, five thousand-plus Google certified and Gemini expertise across seventy-plus countries. And we are also the Fortune hundred, top five companies in the world. So we with the Google Cloud premium partner, we delivered a nearly of like five hundred-plus agentic solution so far, and we are in the leading competitor company in the world.

### Team introduction

**[0:28:01] Deepanraj Vellingiri:** So this is my team. So Udit Agarwal is my head, who is my boss as well. So he leads the entire cloud platform like, Microsoft, Google, and AWS. And I have Sushanth Shetty over here, who is an FDE. And Aditya sits in Singapore. He'll be coming for workshop to meet you live in absence because I'll be on vacation during that time. And myself, Deepan, I just gave my intro. And Eelyn is SDE, and Nabila is also SDE. So Eelyn and Nabila will be supporting the fire cha-chat, where if you have any queries, you can put it in the chat. They will be responding to you. And Sushanth will be taking care of the, Antigravity part, and myself will be taking care of the Gemini Enterprise overview and the hands-on enablement.

### Hackathon briefing

**[0:28:48] Deepanraj Vellingiri:** So, when it comes to a hackathon team, right? So we al-already shared the team what exactly you guys want to build it. To make it simpler, I give some examples as well. This is not going to be like an GAP solution where no-- like, building an fast APA solution. We want to leverage the Gemini Enterprise tool, which is a no-code, low-code SaaS tool. Sits in Google Cloud where you can connect to the any 1P connectors: Google Drive, Google products, cloud storage, or even Gchat, Gcalendar as well. So wha-why we need this solution is in the emerging market, instead of going with the AP solution like fast APA solution, we leverage the low-code, low-code SaaS tool, which will be a differentiator and also it will be benefit for you to learn how the low-code, no-code platform works.

**[0:29:39] Deepanraj Vellingiri:** So this is the theme, smart campus and student experience, where you can leverage how you can build an advanced AI for your campus. So far, we also gave some examples, use cases as well. So it's up to you to decide which one will be the best suitable example to come making it live and going to be as a success factor. So this theme not only focus, right, on the basis of daily, what exactly you use. Also on top of it, I want you guys to come up with your own ideas as well, how exactly you can make innovation and making it live, and it will impact the real-world e-example scenarios. It might be a data-driven solution, it might be an automation solution, it might be an simple workflow solution. All I want is, like, utilize Gemini Enterprise up to the maximum threshold and come up a faster solution, and it should impact the real-world scenarios.

**[0:30:36] Deepanraj Vellingiri:** And coming to submission, I believe already you have gone through the, official website. It might be a ten minutes video Or it can be like a report. I want report to be created in Git explaining how the project you created, how much time you spent it, what is the solution you provided, what is the problem statement, and how it impacts your colleges or how it impacted real world. So you can explain in detail so that it will makes us to understand you created with-- the project with the full-fledged knowledge, considering it for futuristic use case.

### Google Cloud basics

**[0:31:12] Deepanraj Vellingiri:** Okay, now coming to the first scenario, Google Cloud basics. So everybody using Google Cloud, I believe, come for all your workload and for learning purposes. So when it comes to Google Cloud basics, right? First level is like how the Google Cloud is structured.

**[0:31:30] Deepanraj Vellingiri:** I'll move to the slide. So when it comes to Google Cloud structure, you have organization. Under the organization, you will be having several set of folders segregated to with the-- whether it might be a development environment, or it might be a testing environment, or it might be also, for your own purpose, you have a project name or folders you'll be created. Under each folders, you have several set of project creating based on the resources utilization, whether it might be for the testing, or it might be for the front-end, or it might be for the back-end. It up to us to decide how to create the project date, and also the resources can be utilized inside the project.

**[0:32:13] Deepanraj Vellingiri:** I will go to the hands-on now.

**[0:32:19] Deepanraj Vellingiri:** One second. I'm going to switch my screen. Give me a minute.

**[0:32:28] Deepanraj Vellingiri:** Okay, so what I was explaining, right? About the project structure and folder. So this is the overview of Google Cloud Console. So first major thing you need to understand about the hierarchy. So here when you log in, you can see the projects. So these all will be the projects.

**[0:32:46] Deepanraj Vellingiri:** And first level is organization. Under that, you have folders, and each folders will have several set of projects created under-- for our basic needs. So each project will have individual resources. So I'm just giving you overview. For this hackathon, you no need to worry about it, about the project or structure or folders. But this is the basic foundation where you need to understand in depth of the Google, how it's structured. So I'm giving it as a basic overview.

### Gemini Enterprise demo

**[0:33:15] Deepanraj Vellingiri:** So once you land into the Google Cloud Console with your relevant ID, you will see this page, and you'll be tagged to relevant project. So you'll be looking up for the Gemini Enterprise.

**[0:33:36] Deepanraj Vellingiri:** So once you look up for the Gemini Enterprise, you will get this screen. So this screen only pops up when you have the relevant license. I believe Marcus or Cindy will have admin access to allocate the participant Gemini Enterprise license. If you haven't, please reach out to Cindy and Marcus to get the license for this hackathon. And once you land up into this page, into the Gemini Enterprise portal, you just look up for the application.

**[0:34:03] Deepanraj Vellingiri:** And you need to create an application.

**[0:34:08] Deepanraj Vellingiri:** And you can name your application based on your project. So I'm giving, for example.

**[0:34:24] Deepanraj Vellingiri:** Okay. Here you should be go global multi-region, and if you want to give your, school name or organization name, you can give it. It's an optional one. And you can click Create.

**[0:34:39] Deepanraj Vellingiri:** So once you created the project, you will get a link. This, this link can be-- you can customize it as well. You can go to Configuration.

**[0:34:50] Deepanraj Vellingiri:** I mean, customization is not like a hosting URL customization, like just giving you a brand logo, or you want to control it, you can able to control it. And you want to feed the knowledge graph, what exactly do-- should, should do, you can use it. And even when the feature management is the one where you need to turn on the chat enablement and model selector. When you turn on the chat agent and workflow, then you can able to view the agents creation building manually in your, Gemini Enterprise webpage. Make sure to enable in feature management, chat agent and workflows. And eventually which type of LLMs you wanted also you can select it.

**[0:35:36] Deepanraj Vellingiri:** And you can click Save.

**[0:35:43] Deepanraj Vellingiri:** Then you can go to Overview, and you can look up for this URL.

**[0:35:51] Deepanraj Vellingiri:** Once you click that URL, you can see a chatbot. It's a high-level chatbot where you can create your agents as well over here.

**[0:36:02] Deepanraj Vellingiri:** You can create a chat agent. Here you can go build manually, where you can customize your agent based on your needs.

**[0:36:13] Deepanraj Vellingiri:** Actually, it is taking one-- maybe thirty or one, one minute to load it.

**[0:36:21] Deepanraj Vellingiri:** So you can customize it, name, name your agent, and you can, you can connect it to your third-party sources or even 1P connector. So 1P connectors are like a Google built-in resources like G-Type, G-Calendar. Anything comes up with GWS workspace are considered it as 1P connector. 3P connectors are apart from Google resources, whatever you are connecting, like Outlook, SharePoint Or OneDrive, right? It comes under three P connectors, which includes the MCP connectors as well. Any third-party tools like OAuth token configuration or URI-based token configuration comes as three P connectors. So it can give you a prompt instruction over here, personalization. And even you can have a file like PDF or anything, you can upload it over here. Based on your application use case, you can give instruction over here and you can create it.

**[0:37:12] Deepanraj Vellingiri:** But just...

**[0:37:18] Deepanraj Vellingiri:** Hang on. I missed to-- Sorry for the noise. So you can fill all the instruction and you can just create. It will be created. So I will move to, the next part. So where, I will show you how to connect the one P connector as well as three P connector, for example. Go to the connector data store.

**[0:37:41] Deepanraj Vellingiri:** And you can look up for new data store.

**[0:37:48] Deepanraj Vellingiri:** I said, right, first-party data sources are Google-based services and third-party data sources are apart from Google Cloud service providers. You can look up for anything. For example, I'm taking Google Drive as example. So here it is asking for me to share the Google Drive with the folder ID. And here as well, it's asking for the Google ID with folder ID. So this one will be for included in search. If you want to exclude it, like let's take in your G-Drive, there might be multiple folders and subfolders. You want to have only this particular folder needs to be looked up included in the search, you can add it. And in that multiple subfolders, any subfolders or any other folders you want to exclude it, you can just select Exclude and you can upload the-- have the folder ID here.

**[0:38:37] Deepanraj Vellingiri:** So now, for example, I will take my Google Drive folder. I will take this folder, and this will be the folder ID for reference. You can also use your own, Gmail IDs also. It will work perfectly.

**[0:39:01] Deepanraj Vellingiri:** So in my case, I'm using my personal account because NTT there is some policy restriction where I cannot use it. Because if, if I can able to use it, anyone can able to look up the folder, right? So that is some restriction. Here you can say I'm just including this folder, and I'm also including-- Here, this needs to be filled whatever you want to explore it as well. So I'm giving both these folders as to be included. I'm going to click Continue.

**[0:39:26] Deepanraj Vellingiri:** And here comes the access. What all are the access it should have? Like when it comes to agent, right? What all are the relevant access it should have? The permission levels, whether it can be copy file or create file, read file or update, blah, blah, or search files. Or even if it is want to look up for the deleted files which is stored in recycle bin, you can able to retrieve it and delete it. So for this action, I'm going to select all for reference, but in your case, you can make changes as well based on your needs. But for the hands-on, I'm just selecting all. I'm going to click Continue. So I'm going to give the data connector name as Test, and I'm going to create it. Have the tags and sensitive data protection policy as well.

**[0:40:16] Deepanraj Vellingiri:** It's up to us to decide it.

**[0:40:20] Deepanraj Vellingiri:** And, and what is like, you-- sometimes, right, so this one is-- it will take like one or two minutes. So what if it's like, you will, you have like two to three teams, right? You want to divide individually. Either it might be two person will be working on one P connector, or two person will be working on three P connector, right? So those created connectors also you can able to retrieve it from the existing data stores over here. And you can just select the relevant one and you can tag it, connect it. Even SharePoints, you can able to do it. But it should be already configured in your data store. Whatever is configured, it will be showing up in the existing data store. This will be for like a-- Let's take a teamwork, right?

**[0:41:01] Deepanraj Vellingiri:** So in the teamwork, you might be having multiple persons working. So for that, you can able to retrieve the existing data store and having it connected to your agents. So when you start creating the agents, right, it will take one minute to two minutes of time because it undergoes and look up for the file, folder, and configuration details. So in the meanwhile time, what I will do is like, I will go to apps which I already created, and I will show in live how exactly it will work.

**[0:41:34] Deepanraj Vellingiri:** There are a lot of apps, so looking for the one which I used for testing.

**[0:41:43] Deepanraj Vellingiri:** Okay, I will take this one. This one specifically we created for education sector.

**[0:41:50] Deepanraj Vellingiri:** So I will show what are the data connectors I have configured.

**[0:41:56] Deepanraj Vellingiri:** You can see I have connected to Microsoft, SharePoint, OneDrive, and Google Drive as well. And eventually, if you want to connect to MCP servers or you want to connect to URI-based servers also, you can able to use it. That will be like a straightforward. You just need to have the vault URI and the authorization URL and the token, client ID and client secret. So when it comes to token, client ID and client secret, right, it has a pre-built vault in place which is acting as a secure way connection, where it will not expose your token. Eventually, for the handshaking between your agent and the URI token, it will be short-lived token, so where it will not expose your token publicly. So this is one of the security feature where Gemini handles it inbuilt.

**[0:42:49] Deepanraj Vellingiri:** So, so moving towards my agent So once you have seen my connected data stores, right, over here, you can also able to view in the agent also what all are the data source has been connected. And you can ask for it.

**[0:43:14] Deepanraj Vellingiri:** Any-- So once it connected, it starts reading and writing the data.

**[0:43:27] Deepanraj Vellingiri:** So when you give the prompt, it will goes into my SharePoint, and it will look for all the SharePoint file. And you may ask, right, how exactly it works behind the scenes. I'm giving it as example. So instead of in when it comes to AP, right? You need to give the router model where it will be having multiple sub-agent. Here, all the things is handled by the Gemini itself. You can see, right? It read all my data and showcasing and giving a brief overview what the data exactly it and gives department-wise summary as well.

**[0:43:59] Deepanraj Vellingiri:** And gives the sources link as well. So I can-- through a single click, I can go there and check out for it. So and eventually, it gives a suggestion. What this PDF where I want to know what summarize it data, how exactly what the data is residing inside the PDF also, I can able to get it.

**[0:44:18] Deepanraj Vellingiri:** So this is for-- I just gave for SharePoint file. You can go ask for your G-Drive as well, and also i-it can read your Gmails as well. So it depends on the data connector you are configuring.

**[0:44:34] Deepanraj Vellingiri:** Here you can see. It gave me like a document overview, key policy highlight, annually medical plan, and also the source link. So this is specifically this agent I built for the HR department. Likewise, you can have your own use case and y-you can build your own agent.

**[0:44:52] Deepanraj Vellingiri:** And also, here you have couple of LLM models. You can select the what-whatever the preferred model you wanted. So the top one is Gemini three point eight, which is the highest, benchmark, where you can select it and if you give the prompting, the accuracy will be high. And another thing I also like to highlight over here. So I'm just giving the prompt and I'm getting the details. So what if you want to-- you to take action, right? Like this want to be retrieve the data and it wants to send email on behalf of you. It can also do it. So I just connect it to your Outlook or Gmail and just send.

**[0:45:35] Deepanraj Vellingiri:** I'm just giving a prompt. What it does is like the summarized data will be the context of the data is gathered, and it, it will draft it, and it will ask us to send. So, I'm not-- I'm being a lazy guy, so I use the email format to send it. So what I do is like every day morning I-- when I log in, right? I want to know what are the priority mails I want to work for it. So I just give a prompt and I will get all my prompt from that, what are the high priority mails. And there is any action to be taken on behalf of me also, I can schedule it on time. It will take action. So I will also show you how to create the workflows in that. So once you-- I said you right, I will go back again and explain.

**[0:46:20] Deepanraj Vellingiri:** So for this option, it, it will be not be default, so you need to enable it. You need to go to Configuration, and you need to look for Feature management.

**[0:46:32] Deepanraj Vellingiri:** And under the Feature management, you have Enable chat agents and Enable workflows. So once you enable it, then you can able to see the new agent creation.

**[0:46:43] Deepanraj Vellingiri:** So this is for chat agent, which I already showed you. So-- And I will also show you the workflow agent. So what exactly workflow does it like? So it will be like maximizing our work. Let's take it an example. That is like an admission analyst who is working for like, searching for the student immigrants data and also admission of the students, whether the-- all the documents are submitted or not. So using this maximization agent, what it does is like, the admission analyst can connect it to the G-Drive and also SharePoint or OneDrive. Whatever the document submitted over into the SharePoint or OneDrive folders, it will retrieve every day morning at nine AM, and also it will summarize it. And if there is some document is missing, it will automatically send email to the relevant person who not submitted.

**[0:47:35] Deepanraj Vellingiri:** Even for immigrants, right? Let's say they'll be submitting passport or any policy or medical submission. If that thing is not accurate, if some fields are blurred or missed out or even the passport is going to be expired for them prior to the joining, it will observe it, and it will send notification to the student or any consumer in on time. So this one helps the admission analyst not to work on time. So the flow itself runs every day morning, nine AM. So this will make it like you're maximizing for three months or six months without any disruption it runs. So I will show you how to schedule it.

**[0:48:13] Deepanraj Vellingiri:** So you can schedule it daily and what time. Whether it might be Malaysia time you want to run it or even you want to run it on GMT plus ninety, it's up to you guys to decide it. You can have it. And the next step is like, you can give a conversation, right? What exactly it need to do it. So this is all like a h-prompting. So for prompting, you no need to have like a high-level, level knowledge. Just give your prompt whatever comes to your mind. It will be taking it as an example and precise it, and it will be working on that manner. So you no need to have like a precise prompting. You just give your context, whatever comes to top of your mind. I will give like an admission analyst.

**[0:48:56] Deepanraj Vellingiri:** Should run every day morning at nine AM Check for missing files. Okay?

**[0:49:13] Deepanraj Vellingiri:** And what all are the sources you want to connect it? So when it comes to admission analyst, right? So the data of the students or immigrant or any one consumer and files will be storing, it might be in G Drive or even it might be in cloud storage. So you can connect all the one P and three P connectors over here. And you want to have a mail source. It might be Outlook or Gmail. And if you want to update the status back to your SharePoint or any G Doc files, you can have that connector and you can also do it. And also, let's take it in, in your college, that might be like a policy files sitting on somewhere, or you might be having it locally. You can connect that also for the grounded data.

**[0:49:59] Deepanraj Vellingiri:** You can upload it manually also. You can connect it to your G Drive or OneDrive coming from. And if you click More, you can select which type of model you want to use, LLM-based, you can select it. And the next thing. So I just gave you an example, right? This is coming up like I connected everything. What if we want to connect it to the external sources to MCP server to create a ticket to track it? You can create next step where we call it as a sub-agent.

**[0:50:30] Deepanraj Vellingiri:** Having the same flow, you can also have the control flow in place. Le-let's take it, right? Yes or no. Which one to go for approval process something, you can have a condition over here. What if else condition over here. And under that, you can have the approval agent who you are going to approve it. Whether it should be approved from whom and who need to send it, and what will be the approval decision, it requires feedback or not. And once you turn it on, right, it will be start running on every day morning on behalf of you. So it will reduce the time spent for the an-- admission analyst to go in-depth searching OneDrive or G Drive manually and looking of all the students. It might be like, thousands of students are submitting. The thousands of student admission analyst should look off for thousands of files.

**[0:51:16] Deepanraj Vellingiri:** It might be five to ten files and manually identifying what all are the fields missing, what all are the files missing. Through this agent, it can be summarized and the missing file details and drafting the mail is made simpler, and it runs three months, six months, even one year without any disruption. So this is called maximizing our workplace. So when it comes to students, you write, you should think about this use cases where exactly fits for your school and university, where make every day for your operation team life easier. And also when it comes to you for your future entrepreneurship, or you want to develop your own product and you want to sell it, or you want to bring up any AI or ML use cases, you can have this workflow maximization in place. And also you can create your own chat agent as well for your own personal day-to-day life.

**[0:52:06] Deepanraj Vellingiri:** Let's take it. So for PhD students, right? You will be having a lot of IEEE papers or white papers in place. You want to go manually one by one. So instead of manually going one by one, here you can have the Google Public Search enabled, and you can start looking up for your relevant IEEE paper or white paper, and you can come up with a drafted solution, the scope of work, what you want to exactly do, and then you can have the sources tagged as well. So this, this, this will make your life easier for your research and development as well. And also comparing between all the IEEE paper, like twenty or twenty-five IEEE papers, going through each pages. Through this, you can get your summarized detail what exactly you wanted.

**[0:52:52] Deepanraj Vellingiri:** And here you have also deep search in place. And suppose you want to create an image, you can create it, and you can also generate a video. So let's take it you want to present your IEEE paper and you-- to your professors. You want to create slides, you can create slides. And you can also create video for your explanation or demos. You can do it in a short span of time.

**[0:53:15] Deepanraj Vellingiri:** So I'm not going to touch about the video generation and image because you already know it how to use the Nano Banana, which Google gives it for everyone for free. I'm using it. Sorry. So when you go to Google Chrome, right? You will get it free Nano Banana, which now available for everyone.

**[0:53:38] Deepanraj Vellingiri:** And also like you have manual-- In local system, you have couple of files, right? You want to compare or summarize it also, you can add files from here and you can also...

**[0:53:51] Deepanraj Vellingiri:** And these two agents are built-in with, Google. These two agents are built by Google. So this one, Deep Search, is also used highly for the PhD scholars or like IEEE paper comparison. And you want to know about the policy and compliance, and also you want to know about your, like let's take an example. You have like a one P connector connected to your school data sources, and you want to know the scholarship funding available, or when you want to pay the details and what is the school policies or university policies, right? You can connect it to the Deep Search and it will be giving in a precise way. And even the one top of advantages, like you can talk to it and it will be responding back to you in a precise way.

**[0:54:33] Deepanraj Vellingiri:** Not like other competitors. This gives the benchmark is high and accuracy level is also high. I highly suggest you to go into Deep Search o-once you have the Gemini trial license. I believe everybody have it. And you start exploring. More you explore, more you use the token, you will be keen to the competitor with the advanced people know. So why I am saying to use Deep Search is like when it comes to AI, right, when LLMs, it's evolving every day, being frank. Now, now AGI is going to be gone, super intelligent computers and everything are in-- moving now. So when it comes to Deep Search, you can bring the quantum computing technology Solution as well, and also when it comes to build for futuristic solution after five years or three years, where you want to land, right?

**[0:55:20] Deepanraj Vellingiri:** It might be an entrepreneurship or you want to become a developer. It's up to you guys. So you can have a deep search about it, and you can get more de-precise details.

**[0:55:30] Deepanraj Vellingiri:** And Gemini Notebook, you already know about it, I believe. I will just give you an overview where you can create, PPT slides and videos similar to the one which I was showing over there. And also you can connect it to your external sources like YouTube. I believe everybody uses YouTube. You can connect it, and you can get out of that YouTube video what exactly the detail you needed, you can observe it and gather the precise data. Let's take you have a video of one hour or two hour of training session for anything Python or like you go for any courses like quantum computing or any development courses. Instead of going for two hours video and spending time, what you want exactly, like you want to know about the function handlers in development, you can connect to the YouTube and you can get the precise data and you can utilize it.

**[0:56:20] Deepanraj Vellingiri:** So this helps your time consumption flow and what are the details you wanted in a precise way.

**[0:56:29] Deepanraj Vellingiri:** So this is the overview of the notebook. Now it's called as Gemini Notebook, so that you can generate audios, videos, and you can generate report as well. And the mind map is the one which I use regularly. Let's take it, when it comes to DSA, right? You have multiple algorithms in place where you have multiple functions and handlers, definitely. So you'll be having the DSA, how exactly it's going to be structured, how you are going to have the conditions, and how you are going to solving it, right? Through the mind map, you can create your routine. So today I'm going to learn this one, and tomorrow I'm going to learn this chapter. So you can create your own mind map, and you can tag it to your friends as well, so that each one learn it on time, and you can share your knowledge.

**[0:57:15] Deepanraj Vellingiri:** So this mind map, we use it regularly. And if you want to have an infographic view about your mind map, we have infographic feature over here. So, so when it comes to Gemini Enterprise, right, it's one single platform for everyone where you can leverage the knowledge of AI as well. And also when it comes to what's happening in the outside world, like advanced technologies, we want to know about it, you can get it. And also when it comes to your day-to-day activities routine, where you want to automate and keep forward into the top advanced people, you can make, create agents, and you can have your agent for the day-to-day productivity. And coming to your operation point of view for APU, you can create a maximizing workflow agent where it will work on behalf of you. So maximizing is one thing where I exactly look for it because now everyone are looking for maximizing the agent.

**[0:58:08] Deepanraj Vellingiri:** Instead of having an agentic solution, where taking action on behalf of me, reviewing, getting it approved, I will have a maximizing agent which will run twenty-four by seven on behalf of me automatically without disruption. So this one you can consider creating a maximizing agent for your best use case and bring up a solution where we would like to see how exactly it fits to the real world and for your university as well.

### Gemini Enterprise recap

**[0:58:38] Deepanraj Vellingiri:** So this is about the Gemini Enterprise overview.

**[0:58:52] Deepanraj Vellingiri:** Okay, I'm moving to the slide. Being frank, I'm not a slide guy. I like to mo-have more hands-on. So, so this is what we covered it. So chat with the grounded data. Grounded data in the case like you are having a data source where you have PDF or any Excel files is residing, it will be giving the prompt. It goes in-depth and checks for the relevant data, what you are exactly looking for. It gives the output in a precise way. And pre-built Google agent, I showcased you guys Gemini Notebook and also the mind map and even deep search. And also Google's Gemini Enterprise itself a no-code, low-code SaaS tool. So you no need to write any code at all. It's just a plugin and plug out. Whatever you wanted, you connect it straight directly. It might be an MCP server, or even it might be one P or three P connector.

**[0:59:39] Deepanraj Vellingiri:** It's very, very straightforward. And even you can bring, right? You have like a third-party partners as well, Salesforce or SAP. You can able to connect it, and you can connect it to ADK. ADK is like a Google open-source framework tool where you have like a Python, JavaScript, where it makes easier to create the coding agent. But this one for this hackathon, very limited, but up to you guys. Someone want to explore it and having it connected with the third-party solution because Jira gives sandbox environment to connect it and, and even ServiceNow gives us to connect it to APA. You can connect it also, but this is not like a limited hackathon, not restricted to one P and three P. You can also use MCP servers to connect it to third-party partners as well. And main connectors are like OneDrive and G Drive, M365 and Google Workspace system.

**[1:00:32] Deepanraj Vellingiri:** And security and governance, as I said earlier, Google has a inbuilt key vault where whatever the tokens you are giving, it is stored securely. It is not exposed publicly.

**[1:00:45] Deepanraj Vellingiri:** On this hands-on, I covered it to create a no-code agent, chat agent, and workflow agent for maximizing where you can connect it to G Drive or it's up to you guys, whatever it might be, Microsoft tool or Google Drive. It's up to you guys. And also I-I like to highlight, if you face like any connectivity issue with the three P connectors, my colleague Sushanth will be covering up in the Antigravity section how to give the prompting through Antigravity, and you can get the precise answer in a straightforward steps instead of going through multiple website or watching YouTube videos. Google Antigravity does it and gives you precise answer how to get connected to three P connectors and even MCP servers as well.

**[1:01:26] Deepanraj Vellingiri:** So I will hand over to Sushanth for the Antigravity enablement session. Sushanth, over to you.

### Google Antigravity

**[1:01:32] Sushanth Shetty:** Yes. Thanks, Deepan. Thanks for the wonderful, explanation about, Gemini Enterprise. Hi, everyone.

**[1:01:43] Sushanth Shetty:** Let me present my screen.

**[1:01:48] Sushanth Shetty:** So hope my screen is visible.

**[1:01:53] Sushanth Shetty:** Yes.

**[1:01:55] Sushanth Shetty:** So okay. Let's understand what, Gemini, sorry, Antigravity is. Antigravity is a agentic software development platform and IDE as well, where you can build, your software application with help of autonomous agents. When I say autonomous agents, you might have already used Claude, ChatGPT, all these things. But, ChatGPT, Gemini,.. The basic, basic difference between, Y-you already have, Gemini, provided by Google, and there is Antigravity. You might have a question like what is, what is Antigravity when you already have, Gemini? Gemini is, your basic chat assistant where you can ask your questions, and Gemini will answer, answer based on your question. It will give the data. It cannot get into your system and, and, perform like you on behalf of you.

**[1:02:56] Sushanth Shetty:** Then they built Antigravity in two thousand and five, where you can build more interactively, work more interactively, where you can talk to the agents, where you can make agents work for you.

**[1:03:09] Sushanth Shetty:** You have Claude and you have Antigravity. Now, you may have question like, I have Claude and why Antigravity? Your Claude, you can make Claude do the work for you, and Claude has single agent which does the work for you. But with Antigravity, you will get, the freedom where you can build your own agents. You can make-- I'll, I'll come to that one in a while when we get, hands-on. Where we can, configure multiple agents. We'll build a very simple application. But the concept is when you're building application, you can have multiple agents working for you parallelly. Say when you're building your application front-end, back-end, which has front-end, back-end, and, database part can build multiple agents. One agent specifically for building the front-end, one specifically for the back-end, one specifically building your database.

**[1:04:06] Sushanth Shetty:** So all these agents work parallelly and build your application together. So three, four agents working together, then there's a parent agent who is orchestrating all these agents.

**[1:04:19] Sushanth Shetty:** You can install Antigravity.

**[1:04:25] Sushanth Shetty:** And basically, Antigravity comes in three, four, five forms. One is, the Antigravity application, your desktop application.

**[1:04:35] Sushanth Shetty:** And then there is, CLI, for the coders who love doing, terminal-based coding, console-based coding. You, you can use, CLI, Antigravity CLI. And then there is IDE, visual-- VS Code-based IDE, which looks more similar to your VS Code. If you're familiar with Y- VS Code, you can, use Antigravity, with much comfort. And then you have Antigravity SDK. And then even you can use, extensions, Antigravity extension along with your, VS Code. Say if you're using, Cursor or any anti-- VS Code maybe, then you don't need to, switch into another, IDE altogether. You can just use the Antigravity extension, along with your VS Code.

**[1:05:41] Sushanth Shetty:** Yes. Now this is the CLI where, once you, You will get a command to install the Antigravity, the Antigravity. Once you install, you can start your Antigravity by typing AGI.

**[1:06:02] Sushanth Shetty:** And you can, log into your, You can choose the way you want to log into the Antigravity. So once you...

**[1:06:19] Sushanth Shetty:** Yes. Use this and come back.

**[1:06:25] Sushanth Shetty:** Test it.

**[1:06:28] Sushanth Shetty:** Then you're signed in, and then you can select your team.

**[1:06:45] Sushanth Shetty:** Yes. Now, from here, you can start using your application. Now this is the CLI part. Then you have the application. This is your, Antigravity app where, it is more of interactive, application where you can talk to a, your Antigravity and ask it to perform on behalf of you. Then this is the traditional IDE where you can, where you can use as you have used earlier. Like, if you have used earlier, you can see your file structure, file everything, and you can code as well, and you can talk to your agent.

**[1:07:32] Sushanth Shetty:** Now, let's, start-- Let's build one application, very simple application using Antigravity. This is the application, Antigravity app, where I will create one application. This is the workspace. Currently, I'm under demo workspace.

**[1:07:51] Sushanth Shetty:** And this is your agent. You can choose your agent. As Deepan said, this is the, the best agent you have so far, the Gemini, Gemini 3.8. This is Flash. Then you have, two, two agents as well. Then this is the mode which you want to work with. Let's get into, that later. Now, I want to build a application. Say, this is the prompt. I have already created a prompt which I will explain. Let's create one application, and let's just give some instructions to the Antigravity where you have these requirements. Build one small, React application for you, task tracker, and, you explain what features do you need. Add a task using the input and add button. Mark-- the feat-- application should have, option to mark the task as done or delete a task, then filter options.

**[1:08:50] Sushanth Shetty:** Then you give some requirements like how your, code should be. Your code should use only React hooks, no extra libraries. Keep it very simple. Give these instructions and, make it responsive. I'll a-also add few instructions like requirements like...

**[1:09:11] Sushanth Shetty:** Oh. Okay. Anyways, hit enter and, it's already... Now, now your Antigravity is in the planning mode, where it is creating the plan for building your application. Once...

**[1:09:27] Sushanth Shetty:** Yes.

**[1:09:33] Sushanth Shetty:** Now it is asking me every time because I have enabled request to review. Every time whatever the action Antigravity was-- wants to perform, it will ask me and ask for my permission. Now, there are four modes: react, request review, default, auto, and turbo, where default, is asked before only sensitive, sensitive, permission. It will decide only if it is... Oh.

**[1:10:14] Sushanth Shetty:** Am I audible?

**[1:10:15] Deepanraj Vellingiri:** Yes.

**[1:10:16] Sushanth Shetty:** Permission has come.

**[1:10:21] Sushanth Shetty:** Sorry. Because, the Antigravity is doing its job.

**[1:10:27] Sushanth Shetty:** This will, little hiccup in my mission.

**[1:11:57] Sushanth Shetty:** Yeah.

**[1:12:07] Sushanth Shetty:** Deepan, can you take over?

**[1:12:12] Sushanth Shetty:** It's hung. Actually, let's see. Well...

**[1:12:23] Sushanth Shetty:** Hmm. Yes. Okay. So that- There is some internet issue.

### Antigravity and connector demo

**[1:12:41] Deepanraj Vellingiri:** One second.

**[1:12:58] Deepanraj Vellingiri:** I believe my screen is up.

**[1:13:08] Deepanraj Vellingiri:** Okay.

**[1:13:10] Deepanraj Vellingiri:** So, so guys, so when it comes to Antigravity...

**[1:13:17] Deepanraj Vellingiri:** It's echoing. No, now it's fine. Okay. There is some issue with Sushanth's laptop, so he was not able to deliver the Antigravity feature, so I will take up here. So this Antigravity comes with the enterprise license. He showed, how to log into it, right? So what I am going to cover is like how you can create agents and how you can make it like, on your day-to-day activities, how youCan leverage and making it productivity. So as stated, right, you can look out for any folders, any folders where you want to store it in your computer. You select the desired folder and give any prompting based on your use case. Let's take it, right? So you want to connect your, the enterprise with any three P connectors. I will take it as example.

**[1:13:58] Deepanraj Vellingiri:** I, I want to connect it to Outlook, or like I want to connect it to OneDrive. So for your use case, where the OneDrive files have the PDF or Excel files are stored for your organization or universities, right? So I want to know it. So I, so I will give a simple prompt.

**[1:14:16] Deepanraj Vellingiri:** I want to create Ge agent where it should connect to OneDrive and get the files inside OneDrive. So I'm just giving it as example because this is not like GE AP solution. This is purely for the, G-ge Enterprise platform itself. So I'm going to click enter. What exactly the agent does is like, it will first understand what exactly the prompt we gave it, and behind the scenes it will be running the sub-orchestration agent, which will not be-- we are not going to compute. It check and calculate the anti-gravity itself. So this prompt will occur sometime. The reason is like, it's going to ask-- look for like a permission level where it's going to read it, and it's also considering-- we are considering OneDrive, right? So it will, check for whether OneDrive access is already present in or not.

**[1:15:13] Deepanraj Vellingiri:** So this prompt will appear sometime, a pop-up message to give a permission level whether we are agreeing to the permission or not.

**[1:15:24] Deepanraj Vellingiri:** So it will be-- so this one-- so what exactly we do is like, we create like a simple agent and deliver it into any hosting site. But here what we are going to do is like, we are going to get some details how we are going to connect it to OneDrive. And even truly not limited to OneDrive, we can have it to your, G-drive as well as G-calendar as well as how to create an agent as well as how to deploy it as well.

**[1:15:49] Deepanraj Vellingiri:** So actually, why it's asking multiple files is that I just selected one of my previous existing files, so it's going and looking through it. And it's giving understanding what exactly this folder contains, and it's giving time to give some suggestion over there. But it's going to be straightforward. You can select your desired LLM model, and you can select, what is the frequency threshold you are going to give it, whether it might be turbo or default. So when it come, we give you turbo, right? Turbo in this case, you are giving like a permission, fully authorization where it checks all the folders and all the files, whatever you-- it's receiving, and it giving us the answer. So this, this what exactly does this like at the end outcome, right? So you want to create an agent, or you want to create an application, and you want to connect it to your-- deploy it into front-end, any hosting site like Cloud Run, or you want to get connected to your back-end system.

**[1:16:44] Deepanraj Vellingiri:** It might be any DB, right? BigQuery or Cloud SQL. It's up to us. For all the deployment steps it also gives, and even the back-end or middleware service code also it will be generating.

**[1:16:57] Deepanraj Vellingiri:** So actually I just selected the wrong folder, previous one. That is-- that's why it's just little bit, confused what file it should exactly look up for. So but if you cr-create a new one, new folder and a new pro-- new folder and give a new prompt, it will not like take much time. It will not ask for multiple prompts.

**[1:17:23] Deepanraj Vellingiri:** So here you can see, right? It's giving a clear step, precise details, how you want to connect it, and, the step-by-step steps also. How to-- where do you want to log in? An Azure Entra and get the tenant ID and client ID and client secret. And how do you want to retrieve the data through the back-end Node.js code? It's, it's also given. And when it comes to agent integration, I said that the agent three P connector, folder path, and file ID you can give it.

**[1:17:53] Deepanraj Vellingiri:** And even we have a diagram as well, how exactly it's going to be connected and how exactly it's going to be work. So, so if you ask me, right, how I follow it, right? It's, it's very simple, straightforward. I give-- log into this enter.microsoft.portal. So I also, like to show you guys how you can connect with your OneDrive or SharePoint in a simple way. So you c-- you can use your Gmail or Outlook account to this portal where you will see this interface. You no need to log in using, give your any c-credit card details. This is completely free from Azure side. You just go to your app registration and create any application, new registration, and you can give like AP your test.

**[1:18:37] Deepanraj Vellingiri:** And it's asking single tenant XP, you can give multiple. And it's up to you guys to decide. And you can create the application. Okay? And then what you need to do is like, you need to take this client ID. As per the instruction, right? If you go to the response given by tenant ID, client ID, and client secret we require, right? So you can go over here and get this client ID, tenant ID, and you can, you can create secrets over here. And you need to go back to your Gemini Enterprise. One second. I remove my screen to Gemini Enterprise.

**[1:19:19] Deepanraj Vellingiri:** Actually, I have a lot of tabs open.

**[1:19:24] Deepanraj Vellingiri:** Okay. So I go to connected data stores, and I will have a new connector.

**[1:19:33] Deepanraj Vellingiri:** So I will look for-- let's take I want to connect it to SharePoint, for example.

**[1:19:42] Deepanraj Vellingiri:** I give federated search, which is a common and recommended. So and I also like to highlight that if you not aware about these steps, like if you're going with Antigravity new steps and you want to know on the console itself, you can have the tutorials, you can click Start, and the all the details step-by-step, what all you need to have it is given over here. You can follow the steps, and also you can configure it. And again, instant URL for SharePoint will be: this is the instant URL. This comes for free. Even the SharePoint, everything is comes for free with, Microsoft using your account.

**[1:20:21] Deepanraj Vellingiri:** I give it over here and tenant ID and client ID and client secret where I showed you can get it from here.

**[1:20:32] Deepanraj Vellingiri:** One second. The one which I copied is tenant. It's client ID. I copy it over here, and I will pasting it.

**[1:20:41] Deepanraj Vellingiri:** And I will go back to here, and I will copy the tenant ID, which is the directory tenant ID, and copy it and paste it to here. And client ID, client secret, where you need to create the client ID, client secret. Go here.

**[1:21:02] Deepanraj Vellingiri:** You can create with the name, and you can keep your expiry date as per you wish. One eighty days or sixty days or thirty days. You can copy it, and you can have it pasted.

**[1:21:20] Deepanraj Vellingiri:** I will give standard one, and I will give verify auth. So, so this is verify auth, right? So this one I'm using the free tier of Microsoft. Sometimes i-it will throw error because the reason is like we are using it, for free tier, and sometimes, it will show us like, the error codes, right? Those error codes, you can get it from here, and you can ask what is the reason for why we are getting this error also. So all the errors and configuration, right? So when it comes to one P and three P connector, it will be giving us why, why we are getting this error. So in the main step, first step, I forgot to add the local host as re-redirect URL. That's why it's throwing this error. So that in this way, you can go back to your app registration and look up for the relevant one.

**[1:22:11] Deepanraj Vellingiri:** And here you can configure your redirect URL as per the...

**[1:22:18] Deepanraj Vellingiri:** So we need to have the redirect URL. In our case, our redirect URL will be: go back to our Gemini Enterprise. Our redirect URL will be... One second.

**[1:22:35] Deepanraj Vellingiri:** Not now. So this will be our redirect URL. I'm going to copy-paste in the over here. I will select the web single one, copy-paste it. I will configure it.

**[1:22:52] Deepanraj Vellingiri:** On the safer side, I will also have web-based URL authentication. So this will be like, for you guys a best example. The reason is it's already added. That's why it's showing error. The reason is like when you use MCP server, right, you need to know the URI, client ID and client secret. So I will take this app ID, which is the client ID.

**[1:23:17] Deepanraj Vellingiri:** And I go to connect to data stores again because I want to configure URI. That's why I came back again.

**[1:23:25] Deepanraj Vellingiri:** Look up for-- we are using SharePoint, right? For example, SharePoint. I go with federated search, and I just need the SharePoint URL for authentication purpose. I will copy-paste it.

**[1:23:44] Deepanraj Vellingiri:** And I want a tenant ID.

**[1:23:48] Deepanraj Vellingiri:** I will get it. Where is it? Here. This will be the tenant ID. You can see it.

**[1:24:02] Deepanraj Vellingiri:** And application ID is over here.

**[1:24:09] Deepanraj Vellingiri:** Configure it. And I want a secret as well. Secret, I will be deleting it after this. I know you guys are recording it, so I will delete it later. So the secret, we are not, supposed to be shared. So this is like, sensitive information.

**[1:24:28] Deepanraj Vellingiri:** So I will copy this value for the secret, and I will paste it. So if you start anywhere, right? So there you will use Antigravity and getting the things started. And also Antigravity, right? When, when, when it comes to Antigravity, you are building some code or deployment, right? It will be made straightforward to have it deployed into a cloud run or even backend database SQL in a single straightforward way. I will just click Continue. I will just give as test. No, I need to give the SharePoint URL. My bad.

**[1:25:03] Deepanraj Vellingiri:** Th- so this, this is for the three P connectors. So you guys, if you want to connect it to your OneDrive or any third-party systems, you can connect it. So what needs to be included, URI filter, you can have it included, and you can click Continue. And permission-wise, I'm just giving everything, but it's up to you guys what to be restricted. You can have it. And actions as well. For testing purpose, I'm giving everything.

**[1:25:29] Deepanraj Vellingiri:** I will give this data stores name as deepun-apu-test, and I'm not going to give tag because mine is for test account. I don't have any s-sensitive data protection in place.

**[1:25:44] Deepanraj Vellingiri:** So Deepin APU test.

**[1:25:48] Deepanraj Vellingiri:** Yeah, this is the one that number we created. No apps has been connected. I'm going to connect it to our application.

**[1:26:01] Deepanraj Vellingiri:** So if-- I've been stuck, right? So I'm getting this error. I got this error. You can see it, right? So it needs a URI. So that's why I went back to the application based on the suggestion from the Antigravity. I just, sorted the issue.

**[1:26:17] Deepanraj Vellingiri:** So actually, it will take like, ten to thirty seconds to get configured to our application agent. So we need to wait for it.

**[1:26:25] Deepanraj Vellingiri:** Because I gave everything the permissions. So that's why it checks inside the SharePoint what all other sites are listed and what all other files are listed because I gave even comments, attachment, page and file. Because when it comes to SharePoint, it's file and sites, right? You might have seen it e-earlier. So it has multiple folders and structures inside it, and that is also the reason why it's taking time for me to configure.

**[1:26:55] Deepanraj Vellingiri:** And I-- Oops, there's some issue.

**[1:27:01] Deepanraj Vellingiri:** Oh, let me check. Yes, it has been connected. Because, why it was throwing the service connection is like the creation time itself, I started to connect it to my application. Simultaneously, w- I was doing the parallel work, right? That's why it was took s-time, and it's also throwing error, service is not available. Now you can see it has connected to our application, and it's also creating. So once it's created, you can go into our overview, and you can go into our test site, and you can give start prompting. So this is, for the Gemini Enterprise use case. Okay? You can see the connected apps over here. That's it. Because now you can see two connected apps, Deepin APU test as well, earlier one also. So this is what I just gave it for the Gemini Enterprise example.

**[1:27:47] Deepanraj Vellingiri:** So what if, right? So I, I am being a developer, right? I want to create an application. Create an application. Okay?

**[1:27:57] Deepanraj Vellingiri:** So what I will do, first major thing, I will create a new project, and I need to select a relevant project folder. So for this project folder, right, let's take.

**[1:28:13] Deepanraj Vellingiri:** I will n-name it as Test.

**[1:28:19] Deepanraj Vellingiri:** And all my files and everything will be stored in this folder. Okay. One second.

**[1:28:30] Deepanraj Vellingiri:** Okay, I created a test folder which will be acting as my workspace where all my artifacts, coding, development work will be stored. I am going to give a prompt: Create a basic HTML site for the APU education sector for student use case. I'm just giving it a prompt where I'm going to use Gemini three point eight model. And Gemini four Argon is also where it is, the advanced model where I use it for testing. So I'm giving it. So what exactly it does is like behind the scene, there will be like multiple agent which comes up with the Antigravity itself. It understands our requirement. You can see, right? First it took my folder, and then it undergoes and asks for my permission. So let's take it, what type of application I want to build it.

**[1:29:22] Deepanraj Vellingiri:** Because I just gave a blunt use case. Because in-- on top of my mind being frank, no use case was striking, so I just gave a bluntly. So even if you don't have any ideas, you just go to Antigravity, ask for ideas and create your own, whatever the Antigravity suggested, you can build that solution. I'm just giving this HTML, CSS way. But for our hackathon team, we are not focusing on GE AP. We are focusing on only Gemini Enterprise specific to it. To be clear, but not limited to any connectors. You can connect it to MCP. It might be th-third-party vendor, Salesforce, SAP, Jira. We are open to it. But only the required prerequisite is you need to use Gemini En-En-Enterprise, and also you need to use Antigravity, and we need to know how exactly you used it, what is the outcome of it.

**[1:30:14] Deepanraj Vellingiri:** Here you can see, right? It started thinking on behalf of us, and it will be start creating the flow, and it will be giving us the output code. I believe you might have used Claude, right? But when it comes to Claude, there is some set of limitation, but Antigravity is more advanced. The accuracy level is high and benchmark is also high. So when it comes to design and the prompt to deploy it, and specifically focusing for developers or entrepreneurs who want to build application on their own self, Antigravity is the best AI tool available in the market.

**[1:30:50] Deepanraj Vellingiri:** So utilize it more. And if you come across any hurdles, any hurdles, right? You can have the questionnaire sent to Marcus or Cindy with the precise one. They can forward to us. We will be answering your queries. First level, you try to solve it yourself using Antigravity or Gemini Enterprise through prompting. We are not able to figure it out, we are happy to help.

**[1:31:16] Deepanraj Vellingiri:** So, it started thinking. Definitely, I would say because I just gave a-- on top of my mind, no solution was striking, so I gave blunt. So definitely it will take like three to five minutes of time to give the output that is going to create a HTML site. Even I gave HTML, but if you want any framework like TypeScript or React or any back-end source of Node.js, you want to have it, it will be creating. Because all my demos, right? I want to do as a solution architect, I want to create demos and showcasing to the client, right? I use this Antigravity to the threshold maximum Which makes my time easier, and also when it comes to delivering to the cl-client also, I can do it in short span of time.

**[1:31:58] Deepanraj Vellingiri:** You can see the code.

**[1:32:06] Deepanraj Vellingiri:** One second. Let me go to that folder.

**[1:32:10] Deepanraj Vellingiri:** Actually, I have a lot of folders. I created test in somewhere else. I'm looking for the test folder where I created it.

**[1:32:55] Deepanraj Vellingiri:** So to make it easier, it's in download folder. See, I forgot my folder where I created this folder exactly.

**[1:33:04] Deepanraj Vellingiri:** So you wanna see the output?

**[1:33:09] Deepanraj Vellingiri:** This is what it created.

**[1:33:12] Deepanraj Vellingiri:** You can see, right? I know this is a mock-up, right? But even the mock-up for the first level idea, it can be creating a mock-up overview where you can see the course progress, announcement, and also service directory for the each student ID for the student. And also you have the quick links. What is the progress of you? So it created a holistic idea and a simple mock-up. This will be like a starting point for the use case where you can build on top of it, ask the agent to build more precisely. Instead of HTML, you can ask to build a real-time use case website. And even you want to deploy it on Cloud Run, you can ask An-Antigravity to deploy it on behalf of you. I will ask now.

**[1:34:02] Deepanraj Vellingiri:** So Cloud Run is something like a hosting service where you-- it's a serverless. You can host any website, any framework type, it adapts to it, and you can deploy it. So you can see, right? I want to deploy the site in Cloud Run. It is giving a precise way how to do it, what are the steps I need to follow it, and how to-- Cloud Run also showing, and which port it will be running. Everything is shown as precisely. Okay? So this is easier, right? Instead of going to and fro, back to back, one single place where your ideas comes into life. This is not limited to like app development or like configuration. Even you want to have to generate like IEEE or white paper, whatever you wanted, you can just create it. Word document, PPTs, slides or Google Docs, anything you can create it.

**[1:34:51] Deepanraj Vellingiri:** All you need to know is prompting. I'm not saying the prompting should be precise. It might be blunt. You just give it. It will be asking you to precise it. The more you context and instead of spending like fifteen days or twenty days, for simple use case, you can done it in four or five days and making it live also. You can host it in Cloud Run, and you can send it to your colleagues or your friends and making like a, "This is how the project looks like. This will be the outcome of the project, and this is what I did it." Simple and easy, straightforwardly.

**[1:35:23] Deepanraj Vellingiri:** So I will move back to slides.

### Antigravity recap

**[1:35:29] Deepanraj Vellingiri:** Okay. So the Antigravity enablement part where Sushanth have covered how to install it and how exactly it works, and the CLI and SDK has covered it.

**[1:35:41] Deepanraj Vellingiri:** And also we covered about the create a small application, and also we covered how to connect to the 3P connectors, the Gemini Enterprise.

**[1:35:51] Deepanraj Vellingiri:** And now moving to Q&A.

**[1:36:02] Sushanth Shetty:** Learned how to use, Antigravity. So just to keep it simple, start exploring Antigravity just like, cloud, but here the Antigravity provides larger capabilities where you can create your own agents focused for building your application. You can build-- define your agent, tell it exactly what to do, not focusing on everything. You define task for the agent, make them work together and get the solution orchestrated by a parent agent, and your solution ultimately is ready for you, which you can test and, you can comfortably start using Antigravity. You will have free tier, and along with, license, you might get, Antigravity as well, which will be add on for you to exploring the Antigravity and building, your own applications. Thank you. Yes, we are read-- if any questions, we are ready to take the questions.

### Hackathon tracks and deliverables

**[1:37:14] Deepanraj Vellingiri:** So Marcus, Cindy, any question from the student?

**[1:37:24] Cindy Pua:** I think most of the students would like to ask about for the, hackathon deliverables and like would like to know more about the problem statements itself for now.

**[1:37:40] Deepanraj Vellingiri:** Okay. So, there is disturbance, Cindy, so I did not get you clearly. So you are asking about the problem statement, right? What exactly they want to build it?

**[1:37:50] Cindy Pua:** Yeah. And actually they want-- they would like to know about the, deliverables for the each track of itself.

**[1:37:58] Deepanraj Vellingiri:** Yep. So, so, so, so we have three themes, right? I guess my screen is still visible. The first one is smart campus and student experience, right? So this is purely, based on like, what exactly the student can bring for your organization. It might be like, online, training course, like, through Gemini Enterprise, how exactly the student can coordinate through the online trainings and what all are the, advanced technologies are available, like you want to connect to any third-party systems. And also when it comes to like, for the students, right, day-to-day activities, how they can maximize it, right? So this is purely based on like, how you can be like, more smarter. And best use case I would be like, suggest is like, well, if I be a student, right?

**[1:38:48] Deepanraj Vellingiri:** So for my day-to-day activities, right? Every day I need to go through my assessment, right? I do have lot of assessment, and I need to learn DSS, right? So for that, how I can make it simpler through agent. I will create like a four or five agent to make it simpler and how I make that agent work on daily basis. Suppose I'm missing s-my task schedule. I schedule it in five days. I want to learn linear regression algorithm, right? So I want to complete in five days, right? So how exactly where I am progressing it? The way I think smarter, right? With the agent, I will be more smarter than the way I think smarter. So this is something where you can build it. And also another thing for the staff side point of view, operations side point of view.

**[1:39:28] Deepanraj Vellingiri:** So this is for smart campus, right? For the operations side point of view, you can build an admission agent where I should elaborate it, right? So you can build an admission agent where your admission analyst want to go through like thousands of student files, right, who all are submitting the application. Which student have like, missed out some PDF or filled wrongly, right? Instead of those thing going and checking manually, right, they go and use agents. Agent does it for them, and even sending mail, they can do it. So this is purely for the smart campus, how you enable your campus smarter. And not only limited to two solution I said, you can bring on top of it more solution as well. So this is for the first theme. There might be multiple problems, right? Definitely.

**[1:40:09] Deepanraj Vellingiri:** So I gave two scenarios. It might go beyond as well because I know you guys are so smarter. Now, not Gen Zs, right? You guys are called as Gen Alphas. I'm being proud because you guys are more creative. The way you're thinking, right, that it's m-more futuristic. The taking decisions and being smart, really I love it. The current generation, really I love it because you guys are way beyond and forward. So I like to think more and bring your own solution. I gave it as an example, two solution, two problems, but you can bring more on top of it. It's open to you guys because the example use cases are just for something, right? But you can bring more innovative features. That's what I-- we are expecting. So bring more solution. It's not limited to 1P or 3P connectors, and we are open to give to MCP as well.

**[1:40:55] Deepanraj Vellingiri:** You can get sandbox available free. Jira, you have it. SAP, you have it. Integrate with it. When it comes to SAP, lot of things. Your university might be using it for finance team, SAP, right? And anything for tracking. When it comes to organization tracking, right, we always use Jira for tracking purpose. So you can integrate with Jira and bring some ideas. And even, right, so if you want to use databases, I know a lot of people asking about cloud credit, right? I know. I'm not sure exactly because currently what I know is like Gemini Enterprise license is available, where you can use-- create agents and use LLMs, top-level LLMs like Gemini Four Argon, Gemini three point eight, and you can use Antigravity to the core without any token limitation. But when it comes to G-Google Credit, I mean cloud resource credit, I'm not sure about it, but database is also available for free.

**[1:41:42] Deepanraj Vellingiri:** You know Supabase? It's available. You can integrate Gemini with Supabase. Simple. And you want-- don't want to go with database? We have SharePoint. Simple. You don't want to go with, SharePoint? You have DWS workspace itself. You can utilize it, right? So this is not limited to one scope. That's what I, I want to clearly say because I know you guys think a lot, right? So just give the prompt Gemini Enterprise, get the result. Okay. I'm moving to intelligent automation and digital transformation. The intelligent automation is purely now everything is called as maximizing. So we are not using the word agentic at all. Agentic is gone. So agentic is gone. Simply sending mail on behalf of me is not agentic. The what I s-gave example, right, admission analyst, where it will run because yearly, yearly, I believe six months once during the summer it might be intake of students, right?

**[1:42:37] Deepanraj Vellingiri:** Three months once, six months once. There might be five hundred to two thousand application will be submitted, right? So each one instead of going by multiple real-time analyst people, our agent runs three months or six months without any disruption. Where it will take action on behalf of them without logging. So this is called as maximizing, where it takes-- runs twenty-four by seven. So this intelligent automation and digital transformation is not only limited to documentation processing. It also where you can find like, let's take it, right? When it comes to robotic, you will be like having the robotics, right? I believe. I'm not sure. Robotics instead of robotic, what word I can use? So IoT. When it comes to IoT, you migh-might be having telemetry of huge pile of data you'll be getting from open source as well.

**[1:43:28] Deepanraj Vellingiri:** Every day you need to clean it, right? From Kaggle, you might get like a floods of data. You don't know what exactly the data is, right? You want to know the precise data. And usually three months once Kaggle might be updating. So you will be intelligent and get the data filtered by through Gemini Enterprise itself. Okay? So this, this theme two is like it's for digital transformation. So you get the data. From the data, what exactly you can do on top of it Right? It might be a satellite data from Kaggle. I-I'm not sure if Kaggle has an OpenAI API in place. So you can use, instead of Kaggle, GitHub. GitHub, you know, right, how many repositories are there? You can use Git MCP server connected to Gemini Enterprise instead of Kaggle. And whatever the new innovation is coming up, just use your agent to filter it, and it will be showing you whenever it comes up and send notification to you.

**[1:44:23] Deepanraj Vellingiri:** There is some new innovation repos trending market in place, and you can have it digitally shared it to your tabs. For your research also, you can use it. So this is something like more innovative thinking on top of your automation. So more you maximize your work and you go-- more you make work easier. So this is for the theme two. And data-driven research and intelligent decision-making, right? So this is purely based on, like, data analysis and visualization. Let's take it, right? So in your, operation site, there might be, like, fees payment, or it might be like, scholarship funding payment, or it might be anything related to payment. You need to have like a visualized dashboard, or you need to know through a single prompt, what are the fundings available, whether I might be eligible or not.

**[1:45:17] Deepanraj Vellingiri:** You want to know, right? You can create an agent and connect it to back-end sources. So you might get a good, CGPA, right? So based on the CGPA, it should com-- the agent should compare whether you, you are eligible for the scholarship or not. So this is something like more a data-driven solution. You can bring it. I just gave it as an example, but you can think more, and then you can bring your own innovation. And, right, if you want to be more smarter, you just go and give prompt to Gemini Enterprise itself. You get use cases, and you can build it. And what exactly we want from you guys is like, build first thing, solving the problem, what is currently existing. It might be in your organization, or it might should-- to, to the outer world, whole world, or it might be like specific to your, like, student research.

**[1:46:06] Deepanraj Vellingiri:** So you-- the problem statement, what you are trying to solve it, and then how you solving the problem, right? So it might be taking, right, you might be using Gemini Enterprise, Antigravity, it doesn't matter. How you solve the problem? What all are the, the key point you took it? What all are the research you did it? Those kind of pointers you need to have it. And the fourth thing is like how the team work. Definitely, that might be a team. You might be-- have two or three people, or even it might be individually, right? So how, how even if, if it is individual, I would suggest to have like a what all are the research he did it, how he did it, and how he come up with this problem statement, why he is solving this problem statement, and what will be the impact of this problem statement.

**[1:46:48] Deepanraj Vellingiri:** So fifth one will be the impact. Impact is like outcome. Outcome in this case, like what will be the success ratio? So if we are implementing this admission analyst agents, right, what will be the outcome? Outcome will be like reducing the manual workforce, right? Being smarter. And even the accuracy will be high. Instead of checking thousand document, we may miss something, right? Some fields. So this agent will give accuracy of eighty percentage. We-we'll, we'll not have-- I will not say like hundred percent accuracy because AI itself have eighty percent. It will reduce our workforce. So impact is the final step, what we want to have, an achievement outcome of our project. So five things I needed clearly, and it might be in your Git repo explaining it. And also I want like, maybe like three to four minutes a video recording how exactly the problems and solution, and a solution, what all you researched it, and what will be the impact and the outcome.

**[1:47:46] Deepanraj Vellingiri:** So the five things you can cover it in the video and how it's exactly working, you can send it to us.

### Questions and answers

**[1:47:53] Deepanraj Vellingiri:** So any other further queries?

**[1:48:03] Deepanraj Vellingiri:** Where do we, we want how to attach our future project? Yeah, you can use GitHub. So, in all the artifacts, right? So here we don't have artifacts code, right? You can use GitHub. You can create your, like, high-level diagram, and you can create your, problem statement in a PPT slide or PDF. You can use like a notebook, right? NotebookLM, which I was showing. In that you, you your project, you dump your project, it will be creating the PPT and slides, and you can have the PPT and slides into a Git repo. And in read me, right, you can explain it, how you did it, what you did it, and what will be the percentage, and what if we implement now, how it will be impacting, whether it might be three months or six months, it will take time.

**[1:48:46] Deepanraj Vellingiri:** So those kind of things, you can have it in the read me, and you can share it to us.

**[1:48:52] Deepanraj Vellingiri:** So recording of the meeting, Cindy and Marcus can cover it up. They will be sending to you.

**[1:49:02] Deepanraj Vellingiri:** And any other queries?

**[1:49:11] Deepanraj Vellingiri:** About AI, must we highlight place where my teammates use AI? So, so, so about AI, right? Teammate use AI. The more than the teammates are using AI, I want the outcome where it exactly fits to the current environment or ecosystem, right? So where exactly it fit. It might be your operational internal team. It might be for the student, what you have built for yourself. So where exactly it fits.

**[1:49:35] Deepanraj Vellingiri:** Using Gemini is mandatory. Yes, of course, Gemini Enterprise is mandatory.

**[1:49:46] Deepanraj Vellingiri:** So any other questions?

**[1:50:07] Deepanraj Vellingiri:** Okay. Cindy, is there any queries from your side? Or is Marcus is there on the call? Is a website along with this?

**[1:50:21] Cindy Pua:** Oh, for my side, there is no problem.

**[1:50:25] Deepanraj Vellingiri:** Okay.

**[1:50:28] Deepanraj Vellingiri:** So there is a question, is a website along with a solution is a question. So actually, right, so that will be like, from the organization side. So there are a lot of participants, right? The top use cases participants, have the Gemini Enterprise, right? So I was showing to you guys the Gemini Enterprise one, where they will invite us to look up for the project which you have built.

**[1:50:52] Deepanraj Vellingiri:** So this one, right, the URL. So they will be inviting us to look up for the project, how exactly it works. So you just need to, from your project, right? We-- They will add me or Sushanth from the Google side to review your project.

**[1:51:09] Deepanraj Vellingiri:** But this website, right, it's specific to your project, not outside person can be accessible.

**[1:51:17] Deepanraj Vellingiri:** How will be able to access Gemini Enterprise and, the full capacity? So the-- so, so when it comes to Gemini Enterprise, right, you don't have any limitation. So this license for this hackathon is sponsored by Google. They will be giving you Gemini Enterprise trial license for this hackathon. You can able to use it. I also shared how to navigate it. So once you land up to this space, you see the project, and you need to look up for the Gemini Enterprise over here, and you will land into the main page of Gemini Enterprise. There you can start using the Gemini Enterprise by creating your own application. Unassisted area, you need to enable the feature, chat agent and workflow in the configuration once you create your application. So then Antigravity, right? Once, as Sushanth have clearly showcased in video, when you create Antigra-- when you want to create some application or you, you face some issues with the connectors for the Antigravity, right?

**[1:52:14] Deepanraj Vellingiri:** So you go-- you just need to use Antigravity and IDE, and just you need to log in in your browser with the relevant project and relevant credentials, like your college university, where your license is allocated.

**[1:52:35] Deepanraj Vellingiri:** So, Mar-- you just-- So this, this is purely based on, like, Gemini Enterprise, right? Low-code, no-code agent. So this is not like completely coding, right? So we are not going to ask your coding, right, to have it in Git repo. For simple purpose, we are asking just to create a PPT or PDF or Google Slides as a docs as well. It's up to you. Just create it, and also that creation, you just create a repo in Git. Simple. Go to Git and create a repo for yourself, and making it public is up to you. But just have it, PDF or files you created, and have a nice structure README. How exactly you created it, what problem you're solving it, solution, impact, and the teamwork also you need to mention it, and what all the researches you did.

**[1:53:25] Deepanraj Vellingiri:** Simple.

**[1:53:32] Deepanraj Vellingiri:** So any other queries?

**[1:53:41] Participant A:** Hello, can you hear me, sir?

**[1:53:43] Deepanraj Vellingiri:** Yes, please go ahead.

**[1:53:44] Participant A:** Yeah. Yeah. Thank you. How we could access to this link you are sharing the screen?

**[1:53:51] Deepanraj Vellingiri:** So-

**[1:53:51] Participant A:** So Google Enterprise Console.

**[1:53:54] Deepanraj Vellingiri:** Yes. So this will be the link, console.cloud.google.com. So if you log in, right, so this login steps, right, so Cindy and Marcus will give you, because the licensing is coming from Google. I'm not sure who is owning the admin part of it. So this will be the URL where you will be logging in with your college university ID. Or else it might-- If your license is allocated to your personal ID, so you need to use your personal ID. Once you log in, right, with your ID, you will see the project, and in that project, right, there will be a near to here search bar where you'll be looking for the Gemini Enterprise. I will share this link.

**[1:54:36] Participant A:** And we will be given the access for it, right?

**[1:54:39] Deepanraj Vellingiri:** Of course. So for this hackathon, you will get Gemini Enterprise license. Each individual one will get it, or else team-wise, they will get one. I am not sure about it. That is taken care of by Google side, and Google team will confirm on it. So you can connect with Marcus or Cindy on that part.

**[1:55:01] Participant A:** All right. Thank you, sir. And one question I don't know if you guys talked about or not, is the judging criteria. Have you already covered?

**[1:55:10] Deepanraj Vellingiri:** Sorry.

**[1:55:10] Participant A:** The judging crite- criteria for the-

**[1:55:14] Deepanraj Vellingiri:** Oh, judging. Judge-- Yeah, yeah. So judging criteria. So from NTT side, right, we have a team to review your project once we have it. So the, the-- it will be like a, a rating eventually, right? The judging criteria, what we exactly think is like how you brought up the solution and how that solution will impact to the current environment. It might be for the students, yourself, or like considering the whole, university students, or it might be operation side. How will you create the project? Like, the technically, how you connected with-- what are the connectors you used? How well you researched it? And the solution and problem statement, how well soon it impacted, whether it might take three months or six months of time. And also, if you are using maximizing, right? If you use maximizing the workflows, right?

**[1:56:06] Deepanraj Vellingiri:** How will it work in day-to-day productivity life, right? So those are the judging criterias.

**[1:56:14] Participant A:** Mm-hmm.

**[1:56:15] Deepanraj Vellingiri:** When it comes to technical, right, we will see the 1P and 3P connector or any MCP is included, that will be like a add-on, but mainly we focus on 1CP and 3C connectors.

**[1:56:28] Participant A:** Mm-hmm. And using Google is a must, right?

**[1:56:31] Deepanraj Vellingiri:** Yes, of course. Of course, Google is the primary.

**[1:56:34] Participant A:** Yeah.

**[1:56:35] Deepanraj Vellingiri:** Okay. Everything should be built using Gemini Enterprise and Antigravity, not agentic. We want like agents to be built inside Gemini Enterprise.

**[1:56:45] Participant A:** Mm-hmm.

**[1:56:47] Participant A:** Okay. Thank you, sir.

**[1:56:50] Deepanraj Vellingiri:** Thank you. That's a good question.

**[1:56:55] Deepanraj Vellingiri:** So any other queries?

**[1:57:09] Deepanraj Vellingiri:** Okay. Cindy, anything from your side to be clarified?

**[1:57:17] Cindy Pua:** I just wanted to, to confirm that the submission criteria we actually already listed out in the Discord group and also through our website. So the requirements will be, we just have a GitHub repository link and also with the slides and the demo link as well. Yeah.

**[1:57:40] Deepanraj Vellingiri:** That's great. That's great.

**[1:57:41] Cindy Pua:** Yeah. Just to clarify on that, we already listed out in the website.

**[1:57:45] Deepanraj Vellingiri:** That's great. Yeah. Maybe you can reshare the link to the wider audience so that they can take a look.

**[1:57:55] Deepanraj Vellingiri:** Okay then. We will wait for two more minutes. Cindy, if there is any other queries, shall we wind up?

**[1:58:03] Cindy Pua:** All right.

**[1:58:03] Deepanraj Vellingiri:** Yeah, [participant]. Please, go ahead.

**[1:58:04] Participant B:** Hello. Yeah. When I try to log into the consolecloud.google.com, and I logged in with the same email address, which I got the mail from, but it's showing me to, to take any free trial or buying the credits.

**[1:58:21] Deepanraj Vellingiri:** So, so, so here you can see the project.

**[1:58:26] Deepanraj Vellingiri:** So I'm not sure, like, whether, you, you got the license allocated or not. So if you-- license is allocated, right? So you can see your project, and you can able to go to the Gemini Enterprise. So if license is not allocated, it will throw-- You, you don't have access to it. So this license issue, it's taken care of by, I think sponsored by Google team, and I'm not sure who is the admin. Maybe Cindy or Marcus can take it up. So once you have the license, you can able to view the Gemini Enterprise, this page.

**[1:59:03] Participant B:** Thank you.

**[1:59:04] Deepanraj Vellingiri:** Yep.

**[1:59:08] Deepanraj Vellingiri:** Okay, we will wait for one more minute. If there is, no queries, we can wind up the call.

**[1:59:30] Deepanraj Vellingiri:** So, and also if there is any other further queries, right? If you face anything related to access or challenges, right? I'll just have a, a tracker. You can send it to Cindy or Marcus. They can sort-- Because we don't want to take duplicate questions, right? Because I know it might be one hundred or two hundred students, right? So just make it precise, Cindy or Marcus, take it up and send it to us, and we will take it up offline, and we can clarify it.

**[2:00:00] Cindy Pua:** All right. All right. Will do. Will do.

**[2:00:03] Deepanraj Vellingiri:** Okay then. Okay, Cindy, if there is nothing else, we can shall we drop off?

**[2:00:09] Cindy Pua:** Yes. Thank you so much. I think there is one more question, from the chat box.

**[2:00:20] Deepanraj Vellingiri:** So yeah. So Gemini Enterprise is an agentic chatbot. Yes, you are right. And also, when it comes to the connectivity of 1P and 3P connectors, you can use Antigravity. And eventually, right, when you're going to connect through MCP servers, specifically through API and OAuth token, right? It's not straightforward. So you can use Antigravity. Antigravity c-can connect it to Gemini Enterprise also, you can deploy it. That will be like, something you-- I want you guys to explore more, get hands-on. So the-- Because this is a very short span of time, right? I cannot, educate you in like one or two hours about the holistic view of Antigravity. You guys can explore more because Antigravity, with Antigravity itself, you can host it, you can deploy it, you can connect any third-party services straightforwardly. Just explore it, install it.

**[2:01:12] Deepanraj Vellingiri:** Once you have the license, use up to the maximum because they are giving it for free. Just use it for the maximum so that you can learn more.

**[2:01:24] Deepanraj Vellingiri:** Is, is that cl-- I think that clarifies the question.

**[2:01:31] Deepanraj Vellingiri:** So, so, Gemini Enterprise is mandatory. We, we, you need to use Gemini Enterprise. So Antigravity is a supporting tool for Gemini Enterprise.

**[2:01:45] Deepanraj Vellingiri:** Okay. I believe everything is sorted out for now. But definitely when you guys have the license and you start exploring, right? If you face a normal issue, just try to sort it out through directly use Gemini and try to sort it out. And if not, if you are able to sort it out, if it is really required our intention, please send it to Cindy or Marcus, and Cindy or Marcus will be like filtering out the duplication questions, and they will be sending to us.

### Closing

**[2:02:20] Deepanraj Vellingiri:** Okay. Cindy, are we good to wind up now?

**[2:02:27] Participant:** Sure.

**[2:02:28] Deepanraj Vellingiri:** Okay. Thank you, everyone. Have a nice evening. Nice to meet you all. My team will be on onset, on the hackathon day. Let's build an innovative solution. Cheers to all. Thank you. Bye-bye.

**[2:02:45] Participant:** Thank you so much.

**[2:04:03] Participant:** Thank you so much. Thank you. Good night all.

## See also

- [Briefing session slides](slides.md): the 13 slides shown, with their text.
- [Announcements](/docs/sources/discord.com/announcements.md): the Discord posts about joining the briefing.
- [Event details](/docs/sources/gdgocapu.com/event-details.md): the website's schedule and submission requirements.
