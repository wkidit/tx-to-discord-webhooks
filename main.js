const DISCORD_WEBHOOK_URL =
  "YOUR_WEBHOOK_URL";


function shortAddr(addr) {
  if (!addr || typeof addr !== "string") return "-";
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}


function parseTimestamp(ts) {
  if (!ts) return new Date().toISOString();
  try {
    if (typeof ts === "string" && ts.startsWith("0x")) {
      const n = parseInt(ts, 16);
      const ms = n < 1e12 ? n * 1000 : n;
      return new Date(ms).toISOString();
    }
    const n = Number(ts);
    if (!isNaN(n)) {
      const ms = n < 1e12 ? n * 1000 : n;
      return new Date(ms).toISOString();
    }
  } catch (e) {
    // ignore
  }
  return new Date().toISOString();
}

export default {
  async fetch(request) {
    try {
      let data;
      try {
        data = await request.json();
      } catch (e) {
        const text = await request.text();
        if (!text) return new Response("OK", { status: 200 });
        try {
          data = JSON.parse(text);
        } catch (ee) {
          data = { rawBody: text };
        }
      }


      const evtRoot = data.event || {};
      const activities = Array.isArray(evtRoot.activity) ? evtRoot.activity : [];
      const evt = activities[0] || {};

      const from = evt.fromAddress || evt.from || "-";
      const to = evt.toAddress || evt.to || "-";
      const hash = evt.hash || evt.transactionHash || evt.txHash || "-";
      const value = (() => {
        if (typeof evt.value === "number") return evt.value;
        if (evt.rawContract && evt.rawContract.rawValue) {
          try {
            const v = parseInt(evt.rawContract.rawValue, 16);
            
            const dec = evt.rawContract.decimals ?? 18;
            return (v / Math.pow(10, dec));
          } catch (e) {
            return 0;
          }
        }
        return evt.value ?? 0;
      })();
      const asset = evt.asset || (evt.rawContract && evt.rawContract.asset) || "ETH";
      const category = evt.category || "-";
      const block = evt.blockNum || "-";
      const ts = parseTimestamp(evt.blockTimestamp || evtRoot.blockTimestamp || data.createdAt);

      const embed = {
        title: "🔔 New Transaction Detected",
        description: `[View on block explorer](https://basescan.org/tx/${hash})`, // Base explorer; still OK if hash = "-"
        color: 5814783,
        fields: [
          { name: "From", value: `\`${shortAddr(from)}\``, inline: true },
          { name: "To", value: `\`${shortAddr(to)}\``, inline: true },
          { name: "Hash", value: hash !== "-" ? `\`${hash}\`` : "-", inline: false },
          { name: "Value", value: `${value} ${asset}`, inline: true },
          { name: "Category", value: `${category}`, inline: true },
          { name: "Block", value: `${block}`, inline: true }
        ],
        footer: { text: "Alchemy → Cloudflare Worker" },
        timestamp: ts
      };

      let discordResp = await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] })
      });

      if (!discordResp.ok) {
        const text = `New TX Event:\nFrom: ${from}\nTo: ${to}\nHash: ${hash}\nValue: ${value} ${asset}\nBlock: ${block}\nRaw: ${JSON.stringify(data).slice(0, 1900)}`;
        console.error("Discord embed failed", discordResp.status, await discordResp.text());
        const fallback = await fetch(DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text })
        });

        if (!fallback.ok) {
          const body = await fallback.text().catch(() => "");
          console.error("Discord fallback also failed", fallback.status, body);
          return new Response("Failed to send to Discord", { status: 502 });
        }
      }

      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("Worker error:", err);
      return new Response("Error: " + err.toString(), { status: 500 });
    }
  }
};
