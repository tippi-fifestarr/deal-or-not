# Deal or NOT - The Graph Subgraph

Indexes prediction market and agent registry data from Deal or NOT smart contracts.

## Setup

### 1. Install Dependencies

```bash
cd subgraph
npm install
```

### 2. Add Contract ABIs

Copy contract ABIs to the `abis/` directory:

```bash
# From Foundry compilation artifacts
cp ../prototype/contracts/out/PredictionMarket.sol/PredictionMarket.json abis/
cp ../prototype/contracts/out/AgentRegistry.sol/AgentRegistry.json abis/
```

### 3. Update Contract Addresses

Edit `subgraph.yaml` and replace:
- `address: "0x000..."` with deployed PredictionMarket address
- `address: "0x000..."` with deployed AgentRegistry address
- `startBlock: 0` with deployment block numbers

### 4. Generate Code

```bash
npm run codegen
```

This generates TypeScript types in `generated/` from your schema and ABIs.

### 5. Build

```bash
npm run build
```

## Deployment

### Option A: The Graph Studio (Hosted)

1. Create account at https://thegraph.com/studio/
2. Create new subgraph "deal-or-not"
3. Get deploy key from dashboard
4. Deploy:

```bash
graph auth --studio <DEPLOY_KEY>
npm run deploy
```

### Option B: Local Graph Node (Testing)

1. Start local Graph node:

```bash
git clone https://github.com/graphprotocol/graph-node
cd graph-node/docker
./setup.sh
docker-compose up
```

2. Deploy locally:

```bash
npm run create-local
npm run deploy-local
```

## Queries

Access GraphQL playground at:
- **Studio**: https://api.studio.thegraph.com/query/<SUBGRAPH_ID>/deal-or-not/v1.0.0
- **Local**: http://localhost:8000/subgraphs/name/deal-or-not

### Example Queries

#### Get All Open Markets

```graphql
{
  markets(
    where: { status: Open }
    orderBy: totalPool
    orderDirection: desc
    first: 20
  ) {
    id
    gameId
    agentId
    agent {
      name
    }
    marketType
    status
    totalPool
    yesPool
    noPool
    yesOdds
    noOdds
    totalBets
    lockTime
  }
}
```

#### Get Market with Bets

```graphql
{
  market(id: "1") {
    id
    gameId
    agent {
      name
    }
    marketType
    status
    totalPool
    yesOdds
    noOdds
    bets(orderBy: timestamp, orderDirection: desc, first: 20) {
      id
      bettor {
        id
      }
      prediction
      amount
      timestamp
      claimed
    }
  }
}
```

#### Get User Bets

```graphql
{
  user(id: "0x123...") {
    id
    totalBets
    totalStaked
    totalWon
    totalClaimed
    activeBets
    wonBets
    lostBets
    bets(orderBy: timestamp, orderDirection: desc) {
      id
      market {
        id
        gameId
        agent {
          name
        }
        status
        outcome
      }
      prediction
      amount
      won
      payout
      claimed
      timestamp
    }
  }
}
```

#### Get Agent Markets

```graphql
{
  agent(id: "1") {
    id
    name
    owner
    totalMarkets
    markets(orderBy: createdAt, orderDirection: desc) {
      id
      gameId
      marketType
      status
      totalPool
      totalBets
    }
  }
}
```

#### Get Global Stats

```graphql
{
  globalStats(id: "1") {
    totalMarkets
    totalBets
    totalVolume
    activeMarkets
    resolvedMarkets
  }
}
```

## Frontend Integration

Install GraphQL client:

```bash
cd ../prototype/frontend
npm install @apollo/client graphql
```

Create Apollo client:

```typescript
// lib/apollo.ts
import { ApolloClient, InMemoryCache } from '@apollo/client';

export const apolloClient = new ApolloClient({
  uri: 'https://api.studio.thegraph.com/query/<SUBGRAPH_ID>/deal-or-not/v1.0.0',
  cache: new InMemoryCache(),
});
```

Wrap app:

```typescript
// app/layout.tsx
import { ApolloProvider } from '@apollo/client';
import { apolloClient } from '@/lib/apollo';

export default function RootLayout({ children }) {
  return (
    <ApolloProvider client={apolloClient}>
      {children}
    </ApolloProvider>
  );
}
```

Use in components:

```typescript
// app/markets/page.tsx
import { useQuery, gql } from '@apollo/client';

const GET_MARKETS = gql`
  query GetMarkets {
    markets(
      where: { status: Open }
      orderBy: totalPool
      orderDirection: desc
      first: 20
    ) {
      id
      gameId
      agentId
      agent { name }
      marketType
      totalPool
      yesOdds
      noOdds
    }
  }
`;

export default function MarketsPage() {
  const { data, loading, error } = useQuery(GET_MARKETS);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {data.markets.map(market => (
        <MarketCard key={market.id} market={market} />
      ))}
    </div>
  );
}
```

## Monitoring

- **Indexing status**: Check "Subgraph Health" in Graph Studio
- **Query performance**: View "Analytics" tab for query latency
- **Errors**: Check logs for indexing errors

## Troubleshooting

### Subgraph fails to sync

1. Check contract addresses in `subgraph.yaml`
2. Verify ABIs match deployed contracts
3. Check startBlock is correct
4. View indexing logs in Graph Studio

### Entity not found errors

Entities must be created before they're referenced. Make sure:
- Markets are created in `handleMarketCreated` before bets reference them
- Users are created with `loadOrCreateUser()` before bets reference them

### Slow queries

Add indexes to frequently filtered fields:
```graphql
type Market @entity {
  status: MarketStatus! @index
  gameId: BigInt! @index
}
```

## Development

Run tests:

```bash
graph test
```

Update schema:

1. Edit `schema.graphql`
2. Run `npm run codegen`
3. Update mappings in `src/`
4. Run `npm run build`
5. Redeploy

## Resources

- [The Graph Docs](https://thegraph.com/docs/)
- [AssemblyScript Book](https://www.assemblyscript.org/)
- [Subgraph Studio](https://thegraph.com/studio/)
