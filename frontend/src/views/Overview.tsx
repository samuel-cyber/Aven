import { useData } from '../state/data'
import { StatementHeader } from '../components/StatementHeader'
import { RecoveryFeed } from '../components/RecoveryFeed'
import { CustomerPanel } from '../components/CustomerPanel'
import { FixList, HumanQueue, IssueList, ReasonChart } from '../components/Insights'

export function Overview() {
  const { selectedId } = useData()
  return (
    <>
      {/* The first screen ends at the fold: statement, ledger and the customer in play. */}
      <div className="overview-first">
        <StatementHeader />
        <div className="work">
          <RecoveryFeed />
          <CustomerPanel customerId={selectedId} />
        </div>
      </div>
      <div className="insights-grid">
        <ReasonChart />
        <HumanQueue />
        <IssueList />
        <FixList />
      </div>
    </>
  )
}
