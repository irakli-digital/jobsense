const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const axios = require('axios');

/**
 * Job Search Tool
 * Search for job listings using N8N workflow integration
 * Sends a natural language query string to the webhook for flexible processing
 *
 * @example
 * const tool = new JobSearchTool({
 *   N8N_JOB_SEARCH_WEBHOOK_URL: 'https://your-n8n.com/webhook/job-search'
 * });
 *
 * const result = await tool._call({
 *   query: 'Software Engineer in Tbilisi with JavaScript and React skills, mid-level, full-time, remote preferred'
 * });
 */
class JobSearchTool extends Tool {
  /**
   * Returns the LangChain tool name
   * @returns {string}
   */
  static lc_name() {
    return 'job_search';
  }

  /**
   * Initialize the Job Search tool
   * @param {Object} fields - Configuration options
   * @param {string} fields.N8N_JOB_SEARCH_WEBHOOK_URL - N8N job search webhook URL
   * @param {string} fields.N8N_WEBHOOK_URL - Fallback N8N webhook URL
   * @param {string} fields.N8N_API_KEY - Optional API key for authentication
   * @param {number} fields.N8N_TIMEOUT - Request timeout in milliseconds (default: 30000)
   * @param {boolean} fields.override - Skip environment variable validation
   */
  constructor(fields = {}) {
    super(fields);

    this.name = 'job_search';
    this.envVarJobSearchWebhookUrl = 'N8N_JOB_SEARCH_WEBHOOK_URL';
    this.envVarWebhookUrl = 'N8N_WEBHOOK_URL';
    this.envVarApiKey = 'N8N_API_KEY';
    this.envVarTimeout = 'N8N_TIMEOUT';

    this.override = fields.override ?? false;

    // Try job search specific webhook first, then fall back to general N8N webhook
    this.webhookUrl =
      fields[this.envVarJobSearchWebhookUrl] ??
      getEnvironmentVariable(this.envVarJobSearchWebhookUrl) ??
      fields[this.envVarWebhookUrl] ??
      getEnvironmentVariable(this.envVarWebhookUrl);

    this.apiKey = fields[this.envVarApiKey] ?? getEnvironmentVariable(this.envVarApiKey);
    this.timeout = fields[this.envVarTimeout] ?? getEnvironmentVariable(this.envVarTimeout) ?? 30000;

    if (!this.override && !this.webhookUrl) {
      throw new Error(
        `Missing ${this.envVarJobSearchWebhookUrl} or ${this.envVarWebhookUrl} environment variable. ` +
        'Please configure your N8N job search webhook URL in the environment settings.'
      );
    }

    this.description =
      'Search for job listings based on what the user is looking for. ' +
      'Provide a natural language description of the job search including position, location, skills, experience level, and any other relevant criteria. ' +
      'Returns a list of relevant job opportunities with details including title, company, salary, and application links. ' +
      'Use this when the user asks to find jobs, search for positions, or look for employment opportunities. ' +
      'IMPORTANT: When presenting results to the user, format each job detail on a single line with NO empty lines between fields for compact display.';

    // Define the input schema using Zod - simple string query
    this.schema = z.object({
      query: z
        .string()
        .describe('A natural language description of the job search. Include position, location, required skills, experience level, job type (full-time/part-time), salary expectations, remote preference, and any other relevant criteria. Example: "Software Engineer in Tbilisi with JavaScript and React skills, mid-level, full-time, remote preferred"'),
    });
  }

  /**
   * Execute the job search
   * @param {Object} input - The search input
   * @param {string} input.query - Natural language job search query
   * @returns {Promise<string>} JSON string containing job search results
   */
  async _call(input) {
    // Validate input against schema
    const validationResult = this.schema.safeParse(input);
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map(issue =>
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');
      throw new Error(`Input validation failed: ${errors}`);
    }

    const { query } = validationResult.data;

    try {
      // Prepare request headers
      const headers = {
        'Content-Type': 'application/json',
      };

      // Add API key to headers if provided
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      // Execute job search workflow via N8N webhook
      // Send just the query string directly
      const response = await axios.post(
        this.webhookUrl,
        { query }, // Send as simple object with query field
        {
          headers,
          timeout: this.timeout,
        }
      );

      // Return successful response
      return JSON.stringify(response.data, null, 2);

    } catch (error) {
      // Handle timeout errors
      if (error.code === 'ECONNABORTED') {
        return JSON.stringify({
          success: false,
          error: 'Job search timeout',
          message: `The job search did not complete within ${this.timeout}ms. Please try again with more specific criteria.`,
          timeout: this.timeout,
        }, null, 2);
      }

      // Handle network errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return JSON.stringify({
          success: false,
          error: 'Cannot reach job search service',
          message: 'Unable to connect to the job search service. Please try again later.',
          webhookUrl: this.webhookUrl,
        }, null, 2);
      }

      // Handle HTTP errors
      if (error.response) {
        return JSON.stringify({
          success: false,
          error: 'Job search failed',
          message: error.message,
          status: error.response.status,
          statusText: error.response.statusText,
          details: error.response.data,
        }, null, 2);
      }

      // Handle unknown errors
      return JSON.stringify({
        success: false,
        error: 'Unknown error occurred',
        message: error.message,
        type: error.constructor.name,
      }, null, 2);
    }
  }
}

module.exports = JobSearchTool;
