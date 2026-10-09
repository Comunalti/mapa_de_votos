import type { Candidate } from '../types'

type CampaignCandidate = Candidate & { totalVotes?:number|null; estimatedExpenses?:number|null }
export type Summary = {
  costPerVote:number|null; votesPerReal:number|null; votes:number; expenses:number; count:number;
  expenseCount:number; voteCount:number; campaignExpenses:number; estimated:boolean
}
export function campaignVotes(candidate: CampaignCandidate): number|null {
  return candidate.totalVotes === undefined ? candidate.votes : candidate.totalVotes
}
export function campaignRate(candidate: CampaignCandidate): number|null {
  const votes = campaignVotes(candidate)
  return candidate.expenses != null && votes != null && votes > 0 ? candidate.expenses/votes : null
}
export function areaEstimate(candidate: CampaignCandidate): number|null {
  if (candidate.estimatedExpenses !== undefined) return candidate.estimatedExpenses
  if (candidate.totalVotes === undefined) return candidate.expenses
  const total = campaignVotes(candidate)
  if (candidate.expenses == null || candidate.votes == null || total == null || total <= 0 || candidate.votes < 0 || candidate.votes > total) return null
  return candidate.expenses * candidate.votes / total
}
export function summarize(candidates: CampaignCandidate[]): Summary {
  const paired = candidates.filter(c => c.votes != null && c.votes >= 0 && areaEstimate(c) != null)
  const pairedVotes = paired.reduce((sum,c) => sum+(c.votes??0),0)
  const pairedExpenses = paired.reduce((sum,c) => sum+(areaEstimate(c)??0),0)
  return {
    votes: candidates.reduce((sum,c) => sum+(c.votes??0),0),
    expenses: candidates.reduce((sum,c) => sum+(areaEstimate(c)??0),0),
    campaignExpenses: candidates.reduce((sum,c) => sum+(c.expenses??0),0),
    count: paired.length,
    expenseCount: candidates.filter(c=>areaEstimate(c)!=null).length,
    voteCount: candidates.filter(c=>c.votes!=null).length,
    costPerVote: pairedVotes > 0 ? pairedExpenses/pairedVotes : null,
    votesPerReal: pairedExpenses > 0 ? pairedVotes/pairedExpenses : null,
    estimated: candidates.some(c=>c.totalVotes != null && c.votes !== c.totalVotes),
  }
}
