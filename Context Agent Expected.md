# Context Agent: Inputs, Processing, and Outputs

## 1. Company Profile Data

```json
{
  "company_id": "your-company-123",
  "name": "TechHealth Innovations",
  "primary_domains": ["Healthcare", "Digital Health"],
  "secondary_domains": ["Mobility"],
  "core_capabilities": [
    { "name": "AI-powered diagnostics", "maturity": 0.8, "patents": 12 },
    { "name": "Remote patient monitoring", "maturity": 0.7, "patents": 8 },
    { "name": "Wearable medical devices", "maturity": 0.6, "patents": 5 }
  ],
  "strategic_priorities": [
    {
      "name": "Expand telemedicine platform",
      "weight": 0.9,
      "timeframe": "1-2 years"
    },
    {
      "name": "Develop predictive health analytics",
      "weight": 0.8,
      "timeframe": "2-3 years"
    },
    {
      "name": "Enter elderly care market",
      "weight": 0.7,
      "timeframe": "3-5 years"
    }
  ],
  "active_projects": [
    {
      "id": "PRJ-001",
      "name": "NextGen Patient Monitor",
      "domain": "Digital Health",
      "stage": "Development"
    },
    {
      "id": "PRJ-002",
      "name": "AI Diagnostic Assistant",
      "domain": "Healthcare",
      "stage": "Testing"
    }
  ],
  "resource_constraints": {
    "r_and_d_budget": 15000000,
    "technical_staff": 45,
    "manufacturing_capabilities": ["Electronics", "Sensors"]
  }
}
```

## 2. Competitor

```json
[
  {
    "competitor_id": "comp-456",
    "name": "MediTech Solutions",
    "market_share": 0.18,
    "primary_domains": ["Healthcare", "Digital Health"],
    "key_products": [
      {
        "name": "MediTrack Patient Monitor",
        "market_position": "Leader",
        "strength": 0.85
      },
      {
        "name": "DiagnosticAI",
        "market_position": "Challenger",
        "strength": 0.7
      }
    ],
    "recent_moves": [
      {
        "type": "Acquisition",
        "target": "SensorHealth Inc",
        "date": "2024-11-10",
        "estimated_value": 120000000
      },
      {
        "type": "Product Launch",
        "name": "HealthTrack Pro",
        "date": "2025-01-15",
        "category": "Wearables"
      }
    ],
    "patents": [
      {
        "id": "US123456789",
        "title": "Real-time health monitoring system",
        "filing_date": "2023-05-12"
      },
      {
        "id": "US234567890",
        "title": "AI-based diagnostic method",
        "filing_date": "2023-08-22"
      }
    ]
  },
  {
    "competitor_id": "comp-789",
    "name": "HealthMobility Inc",
    "market_share": 0.12,
    "primary_domains": ["Healthcare", "Mobility"],
    "key_products": [
      { "name": "MediTransport", "market_position": "Leader", "strength": 0.9 },
      {
        "name": "PatientMove Platform",
        "market_position": "Leader",
        "strength": 0.8
      }
    ]
  }
]
```

## 3. Trend Data (from Scout Agent)
   {
   // REFER THE RESPONSE FROM SCOUT
   }

## 4. Output Expected

```json
{
  "trend_name": "Ambient Clinical Intelligence",
  "context_analysis": {
    "strategic_alignment": {
      "score": 0.82,
      "aligned_priorities": [
        { "priority": "Develop predictive health analytics", "relevance": 0.9 },
        { "priority": "Expand telemedicine platform", "relevance": 0.7 }
      ],
      "rationale": "Ambient Clinical Intelligence directly supports our strategic priority to develop predictive health analytics by providing real-time data capture and analysis during clinical encounters. It also enhances our telemedicine platform by improving remote documentation capabilities."
    },
    "capability_assessment": {
      "score": 0.65,
      "existing_capabilities": [
        {
          "capability": "AI-powered diagnostics",
          "relevance": 0.8,
          "leverage_potential": "High"
        },
        {
          "capability": "Remote patient monitoring",
          "relevance": 0.6,
          "leverage_potential": "Medium"
        }
      ],
      "capability_gaps": [
        {
          "gap": "Clinical speech recognition",
          "criticality": "High",
          "development_difficulty": "Medium"
        },
        {
          "gap": "Medical natural language processing",
          "criticality": "High",
          "development_difficulty": "High"
        }
      ],
      "rationale": "We can leverage our existing AI diagnostic capabilities, but need to develop expertise in clinical speech recognition and medical NLP to fully capitalize on this trend."
    },
    "competitive_landscape": {
      "score": 0.45,
      "position": "Lagging",
      "key_competitors": [
        {
          "name": "MediTech Solutions",
          "position": "Leading",
          "threat_level": "High"
        },
        {
          "name": "HealthMobility Inc",
          "position": "Minimal Presence",
          "threat_level": "Low"
        }
      ],
      "market_opportunity": "Significant but challenging due to established competition",
      "rationale": "MediTech Solutions has already made strategic moves in this space with their DiagnosticAI platform and recent acquisition of SensorHealth Inc. Their patent portfolio includes directly relevant technology. We are currently lagging in this specific trend area."
    },
    "integration_opportunities": {
      "score": 0.78,
      "project_synergies": [
        {
          "project": "AI Diagnostic Assistant",
          "synergy_level": "High",
          "integration_path": "Add ambient listening capabilities to existing diagnostic platform"
        },
        {
          "project": "NextGen Patient Monitor",
          "synergy_level": "Medium",
          "integration_path": "Incorporate voice-based documentation for monitoring events"
        }
      ],
      "rationale": "Our AI Diagnostic Assistant project provides an excellent foundation for incorporating ambient intelligence capabilities, creating a powerful combined solution."
    },
    "resource_requirements": {
      "estimated_investment": {
        "r_and_d": 3500000,
        "talent_acquisition": 1200000,
        "technology_licensing": 800000,
        "total": 5500000
      },
      "talent_needs": [
        {
          "role": "Speech Recognition Engineer",
          "count": 3,
          "priority": "High"
        },
        { "role": "Medical NLP Specialist", "count": 2, "priority": "High" },
        { "role": "Clinical Workflow Expert", "count": 1, "priority": "Medium" }
      ],
      "timeline": {
        "research_phase": "3-6 months",
        "development_phase": "9-12 months",
        "market_entry": "15-18 months"
      },
      "feasibility": "Medium",
      "rationale": "Resource requirements are significant but within our R&D budget constraints. The primary challenge will be acquiring specialized talent in speech recognition and medical NLP."
    }
  },
  "overall_assessment": {
    "relevance_score": 0.76,
    "pursuit_recommendation": "Strategic Opportunity",
    "recommended_approach": "Partner or Acquire",
    "priority_level": "High",
    "key_considerations": [
      "Strong strategic alignment with our focus on predictive health analytics",
      "Significant capability gaps that may be faster to fill through partnership or acquisition",
      "MediTech Solutions represents both a competitive threat and potential partnership target",
      "Integration with our AI Diagnostic Assistant project creates compelling differentiation"
    ],
    "next_steps": [
      "Conduct detailed analysis of acquisition targets in ambient intelligence space",
      "Evaluate technology licensing opportunities for clinical speech recognition",
      "Begin preliminary integration planning with AI Diagnostic Assistant team",
      "Develop partnership strategy to accelerate market entry"
    ]
  }
}
```

## Real-World Application:
### "How relevant is this emerging technology trend to our business?"
### "Should we invest in this trend, and if so, how?"
### "Where do we stand compared to competitors regarding this trend?"
### "How does this fit with our current projects and strategic priorities?"
### "What resources would we need to allocate to capitalize on this trend?"