from crewai import Agent, Task, Crew, Process
from dotenv import load_dotenv
import json, re

load_dotenv()

class ChatBot:
    def __init__(self):
        self.agent = Agent(
            role="Conversational Chatbot",
            goal="Maintain helpful dialogue and summarize the conversation",
            backstory=(
                "You're a smart and friendly chatbot. "
                "You generate responses to user queries while also keeping a running summary of the conversation."
            ),
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
                "You are a chatbot maintaining an ongoing conversation.\n"
                "Given the user query:\n"
                "{query}\n"
                "and the current summary of the conversation:\n"
                "{summary}\n\n"
                "Your job is to:\n"
                "1. Generate a helpful chatbot response to the query.\n"
                "2. Update the summary of the conversation accordingly.\n\n"
                "Respond ONLY in the following JSON format (include no explanation):\n"
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

        result = crew.kickoff(inputs=inputs)

        try:
            # Use str(result) since CrewOutput doesn't have an 'output' attribute
            output = str(result).strip()
            output = re.sub(r'^```(?:json)?\s*', '', output)
            output = re.sub(r'\s*```$', '', output)
            return json.loads(output)
        except Exception as e:
            return {
                'error': f'Failed to parse JSON response: {str(e)}',
                'raw_output': str(result)  # Ensure this outputs as a string
            }
