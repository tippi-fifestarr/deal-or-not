import { AgentRegistered } from "../generated/AgentRegistry/AgentRegistry";
import { Agent } from "../generated/schema";
import { log } from "@graphprotocol/graph-ts";

export function handleAgentRegistered(event: AgentRegistered): void {
  let agentId = event.params.agentId.toString();
  let agent = new Agent(agentId);

  agent.owner = event.params.owner;
  agent.name = event.params.name;
  agent.totalMarkets = 0;
  agent.gamesPlayed = 0;
  agent.registered = true;

  agent.save();

  log.info("Agent registered: {} name={} owner={}", [
    agentId,
    event.params.name,
    event.params.owner.toHexString(),
  ]);
}
