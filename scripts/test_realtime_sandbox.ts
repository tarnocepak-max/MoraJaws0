import { getSupabaseBackendClient } from '../server/supabaseClient.ts';

function ensureEnvLoaded() {
  // Security: test scripts may only use environment variables explicitly provided
  // to this process. Never inspect /proc or another process environment.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[ENV] Supabase credentials are not available in this test process; remote checks may be BLOCKED.');
  }
}

ensureEnvLoaded();

async function testRealtime() {
  console.log('Testing Supabase Realtime capability...');
  const client = getSupabaseBackendClient();
  if (!client) {
    console.log('[REALTIME AUDIT] Supabase client remote belum terkonfigurasi di environment (BLOCKED).');
    console.log('[REALTIME AUDIT] Arsitektur listener realtime: Supabase Realtime channel subscription prototype tersedia di src/services/supabaseDb.ts.');
    console.log('[REALTIME AUDIT] Publikasi realtime: migrations/003_system_error_logs_and_corrections.sql menambahkan publikasi untuk work_orders, ticket_messages, dan system_error_logs.');
    return;
  }

  const channelName = `sandbox-realtime-test-${Date.now()}`;
  const startTime = Date.now();
  let receivedBroadcast = false;

  const channel = client.channel(channelName, {
    config: {
      broadcast: { self: true }
    }
  });

  const subscriptionPromise = new Promise<string>((resolve) => {
    channel
      .on('broadcast', { event: 'test-event' }, (payload) => {
        console.log('Received broadcast payload:', payload);
        receivedBroadcast = true;
      })
      .subscribe((status, err) => {
        console.log(`Channel subscription status: ${status}`, err ? `Error: ${err.message}` : '');
        if (status === 'SUBSCRIBED') {
          resolve('SUBSCRIBED');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          resolve(status);
        }
      });
  });

  const subStatus = await Promise.race([
    subscriptionPromise,
    new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Subscription timeout 10s')), 10000))
  ]).catch(err => err.message);

  console.log('Final subscription status:', subStatus);

  if (subStatus === 'SUBSCRIBED') {
    // Send broadcast test event
    console.log('Sending broadcast event...');
    const sendRes = await channel.send({
      type: 'broadcast',
      event: 'test-event',
      payload: { message: 'Hello from MoraJaws Phase 6 Sandbox Test', timestamp: new Date().toISOString() }
    });
    console.log('Send result:', sendRes);

    // Wait a brief moment to receive
    await new Promise(r => setTimeout(r, 1000));
    console.log('Broadcast received successfully?:', receivedBroadcast);

    // Unsubscribe cleanly
    console.log('Unsubscribing channel...');
    const unsubRes = await client.removeChannel(channel);
    console.log('Channel removed status:', unsubRes);
    console.log('Realtime latency / test duration:', Date.now() - startTime, 'ms');
  } else {
    await client.removeChannel(channel).catch(() => {});
  }
}

testRealtime().catch(console.error);
