import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Check authentication
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
    window.location.href = 'index.html';
}

document.getElementById('userEmail').textContent = user.email;

// Logout functionality
document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
});

// Load leads with filters
async function loadLeads(filters = {}) {
    try {
        let query = supabase
            .from('leads')
            .select('*, customers(first_name, last_name)')
            .order('total_score', { ascending: false });

        if (filters.status) {
            query = query.eq('status', filters.status);
        }
        if (filters.priority) {
            query = query.eq('priority', filters.priority);
        }
        if (filters.min_score) {
            query = query.gte('total_score', filters.min_score);
        }

        const { data, error } = await query;

        if (error) throw error;

        displayLeads(data);
    } catch (error) {
        console.error('Error loading leads:', error);
        document.getElementById('leadsTableBody').innerHTML = 
            '<tr><td colspan="10" class="error">Error loading leads</td></tr>';
    }
}

function displayLeads(leads) {
    const tbody = document.getElementById('leadsTableBody');
    document.getElementById('leadCount').textContent = leads.length;

    if (leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty">No leads found</td></tr>';
        return;
    }

    tbody.innerHTML = leads.map(lead => {
        const customerName = lead.customers 
            ? `${lead.customers.first_name} ${lead.customers.last_name}`
            : 'Unknown';
        
        const score = lead.total_score || 0;
        const scoreClass = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
        
        return `
            <tr>
                <td><strong>#${lead.lead_number || lead.id.substring(0, 8)}</strong></td>
                <td>${customerName}</td>
                <td><span class="badge badge-${lead.status}">${lead.status}</span></td>
                <td><span class="badge badge-${lead.priority}">${lead.priority}</span></td>
                <td><span class="score score-${scoreClass}">${score}</span></td>
                <td>${lead.product_interest || '-'}</td>
                <td>${lead.herd_size_mentioned || '-'}</td>
                <td>${lead.follow_up_date ? new Date(lead.follow_up_date).toLocaleDateString() : '-'}</td>
                <td>${lead.lps_assigned || '-'}</td>
                <td>
                    <button onclick="viewLead('${lead.id}')" class="btn btn-sm btn-primary">View</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Filter handlers
document.getElementById('applyFilters').addEventListener('click', () => {
    const filters = {
        status: document.getElementById('statusFilter').value,
        priority: document.getElementById('priorityFilter').value,
        min_score: document.getElementById('scoreFilter').value
    };
    loadLeads(filters);
});

document.getElementById('clearFilters').addEventListener('click', () => {
    document.getElementById('statusFilter').value = '';
    document.getElementById('priorityFilter').value = '';
    document.getElementById('scoreFilter').value = '';
    loadLeads();
});

document.getElementById('refreshBtn').addEventListener('click', () => {
    loadLeads();
});

// View lead details
window.viewLead = async function(leadId) {
    try {
        const { data: lead, error } = await supabase
            .from('leads')
            .select('*, customers(first_name, last_name, company_name, phone_primary, email)')
            .eq('id', leadId)
            .single();

        if (error) throw error;

        const customerName = lead.customers 
            ? `${lead.customers.first_name} ${lead.customers.last_name}`
            : 'Unknown';

        document.getElementById('leadDetailContent').innerHTML = `
            <div class="detail-grid">
                <div class="detail-section">
                    <h3>Lead Information</h3>
                    <p><strong>Lead #:</strong> ${lead.lead_number || lead.id.substring(0, 8)}</p>
                    <p><strong>Status:</strong> <span class="badge badge-${lead.status}">${lead.status}</span></p>
                    <p><strong>Priority:</strong> <span class="badge badge-${lead.priority}">${lead.priority}</span></p>
                    <p><strong>Total Score:</strong> ${lead.total_score || 0}</p>
                    <p><strong>Source:</strong> ${lead.source || 'N/A'}</p>
                    <p><strong>Created:</strong> ${new Date(lead.created_at).toLocaleDateString()}</p>
                </div>

                <div class="detail-section">
                    <h3>Customer Information</h3>
                    <p><strong>Name:</strong> ${customerName}</p>
                    ${lead.customers?.company_name ? `<p><strong>Company:</strong> ${lead.customers.company_name}</p>` : ''}
                    ${lead.customers?.phone_primary ? `<p><strong>Phone:</strong> ${lead.customers.phone_primary}</p>` : ''}
                    ${lead.customers?.email ? `<p><strong>Email:</strong> ${lead.customers.email}</p>` : ''}
                </div>

                <div class="detail-section">
                    <h3>Product Interest</h3>
                    <p><strong>Type:</strong> ${lead.product_interest || 'N/A'}</p>
                    ${lead.specific_products ? `
                        <p><strong>Specific Products:</strong></p>
                        <pre>${JSON.stringify(lead.specific_products, null, 2)}</pre>
                    ` : ''}
                    ${lead.service_interest ? `<p><strong>Services:</strong> ${lead.service_interest}</p>` : ''}
                </div>

                <div class="detail-section">
                    <h3>Operation Details</h3>
                    ${lead.herd_size_mentioned ? `<p><strong>Herd Size:</strong> ${lead.herd_size_mentioned}</p>` : ''}
                    ${lead.current_feeding_program ? `<p><strong>Current Program:</strong> ${lead.current_feeding_program}</p>` : ''}
                    ${lead.operation_challenges ? `
                        <p><strong>Challenges:</strong></p>
                        <ul>
                            ${lead.operation_challenges.map(c => `<li>${c}</li>`).join('')}
                        </ul>
                    ` : ''}
                    ${lead.goals_mentioned ? `
                        <p><strong>Goals:</strong></p>
                        <ul>
                            ${lead.goals_mentioned.map(g => `<li>${g}</li>`).join('')}
                        </ul>
                    ` : ''}
                </div>

                <div class="detail-section">
                    <h3>Score Breakdown</h3>
                    <p><strong>Engagement:</strong> ${lead.engagement_score || 0}</p>
                    <p><strong>Fit:</strong> ${lead.fit_score || 0}</p>
                    <p><strong>Intent:</strong> ${lead.intent_score || 0}</p>
                    <p><strong>Total:</strong> ${lead.total_score || 0}</p>
                </div>

                <div class="detail-section">
                    <h3>Assignment & Follow-up</h3>
                    <p><strong>LPS:</strong> ${lead.lps_assigned || 'Unassigned'}</p>
                    ${lead.lps_email ? `<p><strong>LPS Email:</strong> ${lead.lps_email}</p>` : ''}
                    ${lead.follow_up_date ? `
                        <p><strong>Follow-up Date:</strong> ${new Date(lead.follow_up_date).toLocaleDateString()}</p>
                    ` : ''}
                    ${lead.follow_up_notes ? `<p><strong>Notes:</strong> ${lead.follow_up_notes}</p>` : ''}
                </div>

                <div class="detail-section full-width">
                    <h3>Notes</h3>
                    ${lead.initial_notes ? `<p><strong>Initial:</strong> ${lead.initial_notes}</p>` : ''}
                    ${lead.qualification_notes ? `<p><strong>Qualification:</strong> ${lead.qualification_notes}</p>` : ''}
                    ${lead.objections_mentioned ? `
                        <p><strong>Objections:</strong></p>
                        <ul>
                            ${lead.objections_mentioned.map(o => `<li>${o}</li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            </div>
        `;

        document.getElementById('leadModal').style.display = 'block';
    } catch (error) {
        console.error('Error loading lead details:', error);
        alert('Error loading lead details');
    }
};

window.closeLeadModal = function() {
    document.getElementById('leadModal').style.display = 'none';
};

// Initial load
loadLeads();