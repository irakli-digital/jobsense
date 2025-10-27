const { z } = require('zod');
const { Tool } = require('@langchain/core/tools');
const { getEnvironmentVariable } = require('@langchain/core/utils/env');
const axios = require('axios');

/**
 * N8N Workflow Tool
 * Triggers N8N automation workflows and returns the results
 *
 * @example
 * const tool = new N8NTool({
 *   N8N_WEBHOOK_URL: 'https://your-n8n.com/webhook/workflow-id',
 *   N8N_API_KEY: 'your-api-key' // optional
 * });
 *
 * const result = await tool._call({
 *   workflow_data: { customer_id: '123', action: 'process' }
 * });
 */
class N8NTool extends Tool {
  /**
   * Returns the LangChain tool name
   * @returns {string}
   */
  static lc_name() {
    return 'n8n_workflow';
  }

  /**
   * Initialize the N8N tool
   * @param {Object} fields - Configuration options
   * @param {string} fields.N8N_WEBHOOK_URL - N8N webhook URL
   * @param {string} fields.N8N_API_KEY - Optional API key for authentication
   * @param {number} fields.N8N_TIMEOUT - Request timeout in milliseconds (default: 30000)
   * @param {boolean} fields.override - Skip environment variable validation
   */
  constructor(fields = {}) {
    super(fields);

    this.name = 'n8n_workflow';
    this.envVarWebhookUrl = 'N8N_WEBHOOK_URL';
    this.envVarApiKey = 'N8N_API_KEY';
    this.envVarTimeout = 'N8N_TIMEOUT';

    this.override = fields.override ?? false;
    this.webhookUrl = fields[this.envVarWebhookUrl] ?? getEnvironmentVariable(this.envVarWebhookUrl);
    this.apiKey = fields[this.envVarApiKey] ?? getEnvironmentVariable(this.envVarApiKey);
    this.timeout = fields[this.envVarTimeout] ?? getEnvironmentVariable(this.envVarTimeout) ?? 30000;

    if (!this.override && !this.webhookUrl) {
      throw new Error(
        `Missing ${this.envVarWebhookUrl} environment variable. ` +
        'Please configure your N8N webhook URL in the environment settings.'
      );
    }

    this.description =
      'Search for job listings and employment opportunities based on position title, location, skills, ' +
      'experience level, job type (full-time, part-time, contract, remote), salary range, and other criteria. ' +
      'Returns relevant job opportunities with detailed information including job descriptions, requirements, ' +
      'company information, and application links. Use this tool when users are looking for jobs, career opportunities, ' +
      'or want to explore employment options in specific fields or locations.';

    // Define the input schema using Zod
    this.schema = z.object({
      workflow_data: z
        .object({
          position: z.string().optional().describe('Job position or title to search for (e.g., "Software Engineer", "Marketing Manager")'),
          location: z.string().optional().describe('Job location or city (e.g., "Tbilisi", "Remote", "Georgia")'),
          skills: z.array(z.string()).optional().describe('Required skills or technologies (e.g., ["JavaScript", "React", "Node.js"])'),
          experience_level: z.string().optional().describe('Experience level (e.g., "Entry Level", "Mid Level", "Senior", "Expert")'),
          job_type: z.string().optional().describe('Employment type (e.g., "Full-time", "Part-time", "Contract", "Remote")'),
          salary_min: z.number().optional().describe('Minimum salary expectation'),
          salary_max: z.number().optional().describe('Maximum salary expectation'),
          remote: z.boolean().optional().describe('Whether to include remote positions'),
        })
        .passthrough()
        .describe('Job search criteria including position, location, skills, experience level, job type, and salary range.'),
      workflow_name: z
        .string()
        .optional()
        .describe('Optional workflow identifier (default: "job_search")'),
    });
  }

  /**
   * Execute the N8N workflow
   * @param {Object} input - The tool input
   * @param {Object} input.workflow_data - Data to send to N8N workflow
   * @param {string} [input.workflow_name] - Optional workflow identifier
   * @returns {Promise<string>} JSON string containing workflow execution results
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

    const { workflow_data, workflow_name } = validationResult.data;

    try {
      // Prepare request headers
      const headers = {
        'Content-Type': 'application/json',
      };

      // Add API key to headers if provided
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      // Execute N8N workflow via webhook
      const response = await axios.post(
        this.webhookUrl,
        {
          data: workflow_data,
          workflow: workflow_name,
          timestamp: new Date().toISOString(),
          source: 'librechat',
        },
        {
          headers,
          timeout: this.timeout,
        }
      );

      // Return successful response
      return JSON.stringify({
        success: true,
        workflow: workflow_name || 'default',
        result: response.data,
        executedAt: new Date().toISOString(),
        status: response.status,
      }, null, 2);

    } catch (error) {
      // Handle timeout errors
      if (error.code === 'ECONNABORTED') {
        return JSON.stringify({
          success: false,
          error: 'Workflow execution timeout',
          message: `The N8N workflow did not complete within ${this.timeout}ms. The workflow may still be running on N8N.`,
          timeout: this.timeout,
        }, null, 2);
      }

      // Handle network errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        return JSON.stringify({
          success: false,
          error: 'Cannot reach N8N server',
          message: 'Unable to connect to the N8N webhook URL. Please check your N8N instance is running and the URL is correct.',
          webhookUrl: this.webhookUrl,
        }, null, 2);
      }

      // Handle HTTP errors
      if (error.response) {
        return JSON.stringify({
          success: false,
          error: 'N8N workflow execution failed',
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

module.exports = N8NTool;
