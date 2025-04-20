from crewai import Agent, Task, Crew, Process
from dotenv import load_dotenv
import json, re

load_dotenv()

class ChatBot:
    def __init__(self):
        self.agent = Agent(
            role="Conversational Chatbot",
            goal="Maintain helpful dialogue and summarize the conversation",
            backstory="You're a smart and friendly chatbot that generates responses while tracking conversation history.",
            verbose=True,
            llm="azure/gpt-4o-mini"  
        )

    def run_chat(self, query, old_summary=None):
        inputs = {
            'query': query,
            'summary': old_summary or ''
        }

        chat_task = Task(
            description=(
                "As a chatbot maintaining an ongoing conversation:\n"
                "Given the user query:\n"
                "{query}\n"
                "and the current summary:\n"
                "{summary}\n\n"
                "1. Generate a helpful response to the query.\n"
                "2. Update the conversation summary.\n\n"
                "Respond ONLY in JSON format:\n"
                "```\n"
                "{{\n"
                "  \"response\": \"<chatbot response>\",\n"
                "  \"summary\": \"<updated summary>\"\n"
                "}}\n"
                "```"
            ),
            expected_output="A JSON object with 'response' and 'summary' keys.",
            agent=self.agent
        )

        crew = Crew(
            agents=[self.agent],
            tasks=[chat_task],
            process=Process.sequential,
            verbose=True
        )

        try:
            result = str(crew.kickoff(inputs=inputs)).strip()
            # Extract JSON from potential markdown
            result = re.sub(r'^```(?:json)?\s*', '', result)
            result = re.sub(r'\s*```$', '', result)
            return json.loads(result)
        except Exception as e:
            return {
                'error': f'Failed to parse JSON response: {str(e)}',
                'raw_output': str(result)
            }