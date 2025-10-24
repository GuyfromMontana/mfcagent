import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, API_BASE_URL } from './config.js';

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

// Load dashboard data
async function loadDashboardData() {
    try {
        // Get all leads
        const { data: leads, error: leadsError } = await supabase
            .from('leads')
            .select('*');

        if (leadsError) throw leadsError;

        // Calculate stats
        const totalLeads = leads.length;
        const hotLeads = leads.filter(l => l.priority === 'high' && l.total_score >= 70).length;
        const qualifiedLeads = leads.filter(l => l.status === 'qualified').length;
        const followUpLeads = leads.filter(l => {
            if (!l.follow_up_date) return false;
            const today = new Date();
            const followUpDate = new Date(l.follow_up_date);
            return followUpDate <= today && l.status !== 'converted' && l.status !== 'lost';
        }).length;

        // Update stats
        document.getElementById('totalLeads').textContent = totalLeads;
        document.getElementById('hotLeads').textContent = hotLeads;
        document.getElementById('qualifiedLeads').textContent = qualifiedLeads;
        document.getElementById('followUpLeads').textContent = followUpLeads;

        // Status distribution
        const statusCounts = {
            new: leads.filter(l => l.status === 'new').length,
            contacted: leads.filter(l => l.status === 'contacted').length,
            qualified: leads.filter(l => l.status === 'qualified').length,
            converted: leads.filter(l => l.status === 'converted').length
        };

        const maxCount = Math.max(...Object.values(statusCounts), 1);

        document.getElementById('newBar').style.width = `${(statusCounts.new / maxCount) * 100}%`;
        document.getElementById('newCount').textContent = statusCounts.new;

        document.getElementById('contactedBar').style.width = `${(statusCounts.contacted / maxCount) * 100}%`;
        document.getElementById('contactedCount').textContent = statusCounts.contacted;

        document.getElementById('qualifiedBar').style.width = `${(statusCounts.qualified / maxCount) * 100}%`;
        document.getElementById('qualifiedCount').textContent = statusCounts.qualified;

        document.getElementById('convertedBar').style.width = `${(statusCounts.converted / maxCount) * 100}%`;
        document.getElementById('convertedCount').textContent = statusCounts.converted;

        // Display recent leads
        displayRecentLeads(leads);

        // Display follow-up leads
        displayFollowUpLeads(leads);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

function displayRecentLeads(leads) {
    const container = document.getElementById('recentLeadsList');
    const recentLeads = leads
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);

    if (recentLeads.length === 0) {
        container.innerHTML = '<p class="empty">No leads yet</p>';
        return;
    }

    container.innerHTML = recentLeads.map(lead => {
        const customerName = lead.customer_id ? 'Customer' : 'Unknown';
        const score = lead.total_score || 0;
        const scoreClass = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
        
        return `
            <div class="lead-item">
                <div class="lead-info">
                    <strong>Lead #${lead.lead_number || lead.id.substring(0, 8)}</strong>
                    <span class="badge badge-${lead.status}">${lead.status}</span>
                    <span class="score score-${scoreClass}">${score} pts</span>
                </div>
                <div class="lead-details">
                    ${lead.product_interest ? `<small>Interest: ${lead.product_interest}</small>` : ''}
                    <small>${new Date(lead.created_at).toLocaleDateString()}</small>
                </div>
            </div>
        `;
    }).join('');
}

function displayFollowUpLeads(leads) {
    const container = document.getElementById('followUpList');
    const today = new Date();
    
    const followUps = leads
        .filter(l => {
            if (!l.follow_up_date) return false;
            const followUpDate = new Date(l.follow_up_date);
            return followUpDate <= today && l.status !== 'converted' && l.status !== 'lost';
        })
        .sort((a, b) => new Date(a.follow_up_date) - new Date(b.follow_up_date))
        .slice(0, 10);

    if (followUps.length === 0) {
        container.innerHTML = '<p class="empty">No follow-ups due today! 🎉</p>';
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Lead #</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Due Date</th>
                    <th>LPS</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${followUps.map(lead => {
                    const daysOverdue = Math.floor((today - new Date(lead.follow_up_date)) / (1000 * 60 * 60 * 24));
                    return `
                        <tr>
                            <td><strong>#${lead.lead_number || lead.id.substring(0, 8)}</strong></td>
                            <td><span class="badge badge-${lead.status}">${lead.status}</span></td>
                            <td><span class="badge badge-${lead.priority}">${lead.priority}</span></td>
                            <td>
                                ${new Date(lead.follow_up_date).toLocaleDateString()}
                                ${daysOverdue > 0 ? `<br><small class="overdue">${daysOverdue} days overdue</small>` : ''}
                            </td>
                            <td>${lead.lps_assigned || '-'}</td>
                            <td>
                                <a href="leads.html" class="btn btn-sm btn-primary">View</a>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

// Load data on page load
loadDashboardData();

// Refresh every 30 seconds
setInterval(loadDashboardData, 30000);