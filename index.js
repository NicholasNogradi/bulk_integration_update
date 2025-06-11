const {
    getAPIs, 
    extractAPIData, 
    getIntegrations, 
    generateSummary, 
    updateAllGitHubTokens
} = require('./utils/handlers')

// Configuration
const CONFIG = {
    baseUrl: "https://api.swaggerhub.com",
    owner: "SWAGGERHUB_ORG_NAME",
    apiKey: "SWAGGERHUB_API_KEY",
    specType: "API",
    createdBy: "",
    integrationType: ""
};

//Configuration for GitHub token updates
const GITHUB_UPDATE_CONFIG = {
    // Set this to true to enable token updates
    UPDATE_TOKENS: true,
    // Your new GitHub token
    NEW_TOKEN: "NEW_GITHUB_TOKEN",
    // Custom GitHub configuration (optional)
    GITHUB_CONFIG: {
        owner: "GITHUB_USERNAME",
        // repository: "your-repo-name",
        // branch: "main",
        // syncMethod: "Basic Sync",
        // target: "YAML (Unresolved)",
        // outputFolder: "yaml-resolved",
        // outputFile: "swagger.yaml"
        // Add any other GitHub integration config you want to update
    }
};

// Main execution function
const main = async (updateTokens = false, newGitHubToken = null) => {
    try {
        // Step 1: Get all APIs
        const apiResponse = await getAPIs(CONFIG.baseUrl, CONFIG.owner, CONFIG.specType, CONFIG.apiKey);
        
        // Step 2: Extract API data
        const apiData = extractAPIData(apiResponse);
        console.log("Extracted API data:", apiData);
        
        if (apiData.length === 0) {
            console.log("No APIs found to process");
            return;
        }
        
        // Step 3: Get integrations for all APIs
        const integrationResults = await getIntegrations(apiData, CONFIG.baseUrl, CONFIG.owner, CONFIG.apiKey);
        
        // Step 4: Generate summary
        const summary = generateSummary(apiData, integrationResults);
        
        // Step 5: Update GitHub tokens if requested
        let tokenUpdateResults = [];
        if (updateTokens && newGitHubToken) {
            tokenUpdateResults = await updateAllGitHubTokens(integrationResults, newGitHubToken, CONFIG.baseUrl, CONFIG.owner, CONFIG.apiKey, GITHUB_UPDATE_CONFIG.GITHUB_CONFIG.owner);
        }
        
        // Step 6: Output results
        console.log("\n" + "=".repeat(30));
        console.log("DETAILED RESULTS");
        console.log("=".repeat(30));
        
        // Group results by success/failure
        const successfulResults = integrationResults.filter(r => r.success);
        const failedResults = integrationResults.filter(r => !r.success);
        
        if (successfulResults.length > 0) {
            console.log("\n✓ SUCCESSFUL INTEGRATIONS:");
            successfulResults.forEach(result => {
                console.log(`  - ${result.apiName} v${result.version}: ${result.statusCode}`);
            });
        }
        
        if (failedResults.length > 0) {
            console.log("\n✗ FAILED INTEGRATIONS:");
            failedResults.forEach(result => {
                console.log(`  - ${result.apiName} v${result.version}: ${result.error || result.statusCode}`);
            });
        }
        
        // Return all data for further processing if needed
        return {
            apiData,
            integrationResults,
            summary,
            tokenUpdateResults
        };
        
    } catch (error) {
        console.error("Script execution failed:", error);
        process.exit(1);
    }
};

// Function to write results to files
const writeResultsToFiles = (results) => {
    const fs = require('fs');
    const path = require('path');
    
    // Create results directory if it doesn't exist
    const resultsDir = 'swaggerhub_results';
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Write complete results
    const completeResultsPath = path.join(resultsDir, `complete_results_${timestamp}.json`);
    fs.writeFileSync(completeResultsPath, JSON.stringify(results, null, 2));
    console.log(`✓ Complete results written to: ${completeResultsPath}`);
    
    // Write integration results only (matching your provided format)
    const integrationResultsPath = path.join(resultsDir, `integration_results_${timestamp}.json`);
    fs.writeFileSync(integrationResultsPath, JSON.stringify(results.integrationResults, null, 2));
    console.log(`✓ Integration results written to: ${integrationResultsPath}`);
    
    // Write summary
    const summaryPath = path.join(resultsDir, `summary_${timestamp}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(results.summary, null, 2));
    console.log(`✓ Summary written to: ${summaryPath}`);
    
    // Write CSV report for easy analysis
    const csvPath = path.join(resultsDir, `integration_report_${timestamp}.csv`);
    const csvContent = generateCSVReport(results.integrationResults);
    fs.writeFileSync(csvPath, csvContent);
    console.log(`✓ CSV report written to: ${csvPath}`);
    
    // Write detailed integration breakdown
    const detailedPath = path.join(resultsDir, `detailed_integrations_${timestamp}.json`);
    const detailedBreakdown = generateDetailedIntegrationBreakdown(results.integrationResults);
    fs.writeFileSync(detailedPath, JSON.stringify(detailedBreakdown, null, 2));
    console.log(`✓ Detailed integration breakdown written to: ${detailedPath}`);
};

// Function to generate CSV report
const generateCSVReport = (integrationResults) => {
    const csvRows = ['API Name,Version,Status,Status Code,Integration Count,Integration Types,URL'];
    
    integrationResults.forEach(result => {
        const integrationCount = result.responseData?.integrations?.length || 0;
        const integrationTypes = result.responseData?.integrations?.map(i => i.configType).join('; ') || 'None';
        const status = result.success ? 'Success' : 'Failed';
        
        csvRows.push(`"${result.apiName}","${result.version}","${status}","${result.statusCode}","${integrationCount}","${integrationTypes}","${result.url}"`);
    });
    
    return csvRows.join('\n');
};

// Function to generate detailed integration breakdown
const generateDetailedIntegrationBreakdown = (integrationResults) => {
    const breakdown = {
        summary: {
            totalAPIs: integrationResults.length,
            apisWithIntegrations: 0,
            apisWithoutIntegrations: 0,
            totalIntegrations: 0
        },
        integrationTypes: {},
        apiDetails: []
    };
    
    integrationResults.forEach(result => {
        const integrations = result.responseData?.integrations || [];
        const hasIntegrations = integrations.length > 0;
        
        if (hasIntegrations) {
            breakdown.summary.apisWithIntegrations++;
            breakdown.summary.totalIntegrations += integrations.length;
        } else {
            breakdown.summary.apisWithoutIntegrations++;
        }
        
        // Count integration types
        integrations.forEach(integration => {
            const type = integration.configType;
            if (!breakdown.integrationTypes[type]) {
                breakdown.integrationTypes[type] = 0;
            }
            breakdown.integrationTypes[type]++;
        });
        
        // Add API details
        breakdown.apiDetails.push({
            apiName: result.apiName,
            version: result.version,
            success: result.success,
            integrationCount: integrations.length,
            integrations: integrations.map(i => ({
                id: i.id,
                name: i.name,
                enabled: i.enabled,
                type: i.configType
            }))
        });
    });
    
    return breakdown;
};




// Execute the script
if (require.main === module) {
    main(GITHUB_UPDATE_CONFIG.UPDATE_TOKENS, GITHUB_UPDATE_CONFIG.NEW_TOKEN, GITHUB_UPDATE_CONFIG.GITHUB_CONFIG)
        .then(results => {
            console.log("\n✓ Script completed successfully");
            
            // Write results to files
            writeResultsToFiles(results);
            
            // Additional file for token update results if performed
            if (results.tokenUpdateResults && results.tokenUpdateResults.length > 0) {
                const fs = require('fs');
                const path = require('path');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const tokenUpdatePath = path.join('swaggerhub_results', `token_update_results_${timestamp}.json`);
                fs.writeFileSync(tokenUpdatePath, JSON.stringify(results.tokenUpdateResults, null, 2));
                console.log(`✓ Token update results written to: ${tokenUpdatePath}`);
            }
            
            console.log("\n" + "=".repeat(50));
            console.log("FILES CREATED:");
            console.log("=".repeat(50));
            console.log("📁 swaggerhub_results/ directory contains:");
            console.log("  📄 complete_results_[timestamp].json - Full results");
            console.log("  📄 integration_results_[timestamp].json - Integration data only");
            console.log("  📄 summary_[timestamp].json - Summary statistics");
            console.log("  📄 integration_report_[timestamp].csv - CSV for analysis");
            console.log("  📄 detailed_integrations_[timestamp].json - Detailed breakdown");
            if (results.tokenUpdateResults && results.tokenUpdateResults.length > 0) {
                console.log("  📄 token_update_results_[timestamp].json - GitHub token update results");
            }
            console.log("=".repeat(50));
        })
        .catch(error => {
            console.error("Script failed:", error);
            process.exit(1);
        });
}



