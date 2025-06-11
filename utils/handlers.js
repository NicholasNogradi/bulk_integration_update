// Function to get all APIs
const getAPIs = async (baseUrl, owner, specType, apiKey) => {
    try {
        console.log("Fetching APIs from SwaggerHub...");
        
        const response = await fetch(`${baseUrl}/specs?owner=${owner}&specType=${specType}`, {
            method: 'GET',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            },
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`✓ Successfully fetched ${data.apis?.length || 0} APIs`);
        
        return data;
    } catch (error) {
        console.error('Error fetching APIs:', error);
        throw error;
    }
};

// Function to extract API data from response
const extractAPIData = (responseData) => {
    const apiData = [];
    
    if (responseData && responseData.apis && Array.isArray(responseData.apis)) {
        responseData.apis.forEach(api => {
            const apiObj = {
                name: null,
                versions: null,
                createdBy: null
            };
            
            let extractedName = null;
            
            if (api.properties && Array.isArray(api.properties)) {
                api.properties.forEach(property => {
                    // Extract name from Swagger URL
                    if (property.type === "Swagger" && property.url) {
                        const urlParts = property.url.split('/');
                        if (urlParts.length >= 3) {
                            extractedName = urlParts[urlParts.length - 2];
                        }
                    }
                    
                    // Extract X-Versions values
                    if (property.type === "X-Versions" && property.value) {
                        const cleanedVersions = property.value
                            .split(',')
                            .map(version => version.trim().replace(/^[*-]+/, ''))
                            .join(',');
                        
                        apiObj.versions = cleanedVersions;
                    }

                    // Extract X-CreatedBy values
                    if(property.type === "X-CreatedBy" && property.value) {
                        const createdBy = property.value;

                        apiObj.createdBy = createdBy
                    }
                });
            }
            
            // Use extracted name from URL, fallback to api.name if not found
            apiObj.name = extractedName || api.name;
            
            // Only push if we have a name
            if (apiObj.name) {
                apiData.push(apiObj);
            }
        });
    }

    console.log(apiData)
    
    return apiData;
};

// Function to make a single integration request. Is called by getIntegrations function below
const makeIntegrationRequest = async (baseUrl, owner, apiKey, apiItem, version) => {
    const integrationUrl = `${baseUrl}/apis/${encodeURIComponent(owner)}/${encodeURIComponent(apiItem.name)}/${encodeURIComponent(version)}/integrations`;
    
    const result = {
        apiName: apiItem.name,
        version: version,
        url: integrationUrl,
        timestamp: new Date().toISOString(),
        success: false,
        statusCode: null,
        error: null,
        responseData: null
    };
    
    try {
        console.log(`Making integration request: ${apiItem.name} v${version}`);
        
        const response = await fetch(integrationUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': apiKey
            }
        });
        
        result.statusCode = response.status;
        result.success = response.status >= 200 && response.status < 300;
        
        if (result.success) {
            console.log(`✓ Success for ${apiItem.name} v${version} - Status: ${response.status}`);
            try {
                result.responseData = await response.json();
            } catch (parseErr) {
                result.responseData = await response.text();
            }
        } else {
            console.log(`✗ Failed for ${apiItem.name} v${version} - Status: ${response.status}`);
            result.error = `HTTP ${response.status}`;
        }
        
    } catch (error) {
        console.error(`Error for ${apiItem.name} v${version}:`, error.message);
        result.error = error.message;
    }
    
    return result;
};

// Function to get integrations for all APIs
const getIntegrations = async (apiData, baseUrl, owner, apiKey) => {
    console.log("\nStarting integration requests...");
    console.log("Total APIs to process:", apiData.length);
    
    const results = [];
    const promises = [];
    
    // Process all APIs and their versions
    for (const apiItem of apiData) {
        const versions = apiItem.versions ? apiItem.versions.split(',') : [''];
        
        for (const version of versions) {
            const trimmedVersion = version.trim();
            
            // Skip empty versions
            if (!trimmedVersion) {
                console.log(`Skipping empty version for API: ${apiItem.name}`);
                continue;
            }
            
            // Add promise to array for concurrent execution
            promises.push(makeIntegrationRequest(baseUrl, owner, apiKey, apiItem, trimmedVersion));
        }
    }
    
    // Execute all requests concurrently
    const integrationResults = await Promise.all(promises);
    results.push(...integrationResults);
    
    return results;
};

// Function to update GitHub integration token. Is called by updateAllGitHubTokens below
const updateGitHubIntegrationToken = async (baseUrl, owner, apiKey, apiName, version, integrationId, newToken, gitOwner) => {

    const cleanOwner = owner.trim();
    const cleanApiName = apiName.trim();
    const cleanVersion = version.trim();

    const patchUrl = `${baseUrl}/apis/${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanApiName)}/${encodeURIComponent(cleanVersion)}/integrations/${integrationId}`;
    
    // Only update the token field - don't touch other configuration
    const requestBody = {
        token: newToken,
        owner: gitOwner
    };
    
    const result = {
        apiName: cleanApiName,
        version: cleanVersion,
        integrationId,
        url: patchUrl,
        timestamp: new Date().toISOString(),
        success: false,
        statusCode: null,
        error: null,
        requestBody,
        responseData: null
    };
    
    try {
        console.log(`Updating GitHub integration token: ${cleanApiName} v${cleanVersion} (${integrationId})`);
        console.log(`  URL: ${patchUrl}`);
        
        const response = await fetch(patchUrl, {
            method: 'PATCH',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': apiKey
            },
            body: JSON.stringify(requestBody)
        });
        
        result.statusCode = response.status;
        result.success = response.status >= 200 && response.status < 300;
        
        if (result.success) {
            console.log(`✓ Successfully updated token for ${cleanApiName} ${cleanVersion} - Status: ${response.status}`);
            try {
                result.responseData = await response.json();
            } catch (parseErr) {
                result.responseData = await response.text();
            }
        } else {
            console.log(`✗ Failed to update token for ${cleanApiName} v${cleanVersion} - Status: ${response.status}`);
            result.error = `HTTP ${response.status}`;
            try {
                const errorText = await response.text();
                result.error += ` - ${errorText}`;

                // Enhanced debugging for 400 errors
                if (response.status === 400) {
                    console.log(`  DEBUG INFO:`);
                    console.log(`    Owner: "${cleanOwner}"`);
                    console.log(`    API Name: "${cleanApiName}"`);
                    console.log(`    Version: "${cleanVersion}"`);
                    console.log(`    Integration ID: "${integrationId}"`);
                    console.log(`    Full URL: ${patchUrl}`);
                    console.log(`    Error Response: ${errorText}`);
                }
            } catch (textError) {
                console.log(`  Could not read error response: ${textError.message}`);
            }
        }
        
    } catch (error) {
        console.error(`Error updating token for ${apiName} v${version}:`, error.message);
        result.error = error.message;
    }
    
    return result;
};

// Function to update all GitHub integration tokens
const updateAllGitHubTokens = async (integrationResults, newToken, baseUrl, owner, apiKey, gitOwner) => {
    console.log("\n" + "=".repeat(50));
    console.log("UPDATING GITHUB INTEGRATION TOKENS");
    console.log("=".repeat(50));

     // Only process integrations from completely successful API calls
     const successfulResults = integrationResults.filter(result => 
        result.success && 
        result.statusCode === 200 && 
        result.responseData?.integrations
    );

    console.log(`Processing ${successfulResults.length} of ${integrationResults.length} integration results`);
    
    // Find all GitHub integrations
    const githubIntegrations = [];
    
    integrationResults.forEach(result => {
        if (result.success && result.responseData?.integrations) {
            result.responseData.integrations.forEach(integration => {
                if (integration.configType === 'GITHUB') {
                    githubIntegrations.push({
                        apiName: result.apiName,
                        version: result.version,
                        integrationId: integration.id,
                        integrationName: integration.name,
                        enabled: integration.enabled,
                        originalSuccess: result.success,
                        originalUrl: result.url
                    });
                }
            });
        }
    });
    
    console.log(`Found ${githubIntegrations.length} GitHub integrations to update`);
    
    if (githubIntegrations.length === 0) {
        console.log("No GitHub integrations found to update");
        return [];
    }
    
    // Update all GitHub integrations - only updating the token field
    const updatePromises = githubIntegrations.map(integration => 
        updateGitHubIntegrationToken(
            baseUrl,
            owner,
            apiKey,
            integration.apiName,
            integration.version,
            integration.integrationId,
            newToken,
            gitOwner
        )
    );
    
    const updateResults = await Promise.all(updatePromises);
    
    // Summary of updates
    const successful = updateResults.filter(r => r.success).length;
    const failed = updateResults.filter(r => !r.success).length;
    
    console.log("\n" + "=".repeat(30));
    console.log("TOKEN UPDATE SUMMARY");
    console.log("=".repeat(30));
    console.log(`Total GitHub integrations: ${githubIntegrations.length}`);
    console.log(`Successfully updated: ${successful}`);
    console.log(`Failed updates: ${failed}`);
    console.log("=".repeat(30));
    
    return updateResults;
};

// Function to generate final summary
const generateSummary = (apiData, results) => {
    const summary = {
        totalApis: apiData.length,
        totalRequests: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        completedAt: new Date().toISOString()
    };
    
    console.log("\n" + "=".repeat(50));
    console.log("INTEGRATION REQUESTS SUMMARY");
    console.log("=".repeat(50));
    console.log("Total APIs processed:", summary.totalApis);
    console.log("Total requests made:", summary.totalRequests);
    console.log("Successful requests:", summary.successful);
    console.log("Failed requests:", summary.failed);
    console.log("=".repeat(50));
    
    return summary;
};

module.exports = {
    getAPIs,
    extractAPIData,
    getIntegrations,
    generateSummary,
    updateGitHubIntegrationToken,
    makeIntegrationRequest,
    updateAllGitHubTokens
}