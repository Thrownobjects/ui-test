// Official hosted TradingView embed: quotes stay inside the provider widget.
// This is a chart/display integration, not a brokerage or quote-extraction API.
(() => {
  for (const mount of document.querySelectorAll('[data-tradingview]')) {
    const crypto = mount.dataset.tradingview === 'crypto';
    const watchlist = crypto
      ? ['COINBASE:BTCUSD','COINBASE:ETHUSD','COINBASE:SOLUSD']
      : ['NASDAQ:IBIT','NASDAQ:TSLA','NASDAQ:NVDA','NASDAQ:AAPL','NYSE:GME'];
    const container=document.createElement('div');
    container.className='tradingview-widget-container';
    container.style.cssText='height:600px;width:100%';
    const widget=document.createElement('div');
    widget.className='tradingview-widget-container__widget';
    widget.style.cssText='height:calc(100% - 32px);width:100%';
    const credit=document.createElement('div');credit.className='tradingview-widget-copyright';
    const link=document.createElement('a');
    link.href='https://www.tradingview.com/chart/?symbol='+encodeURIComponent(watchlist[0]);
    link.target='_blank';link.rel='noopener nofollow';link.textContent=(crypto?'Crypto':'Stock')+' charts by TradingView';
    credit.append(link);
    const script=document.createElement('script');
    script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async=true;
    script.textContent=JSON.stringify({autosize:true,symbol:watchlist[0],interval:'1',timezone:'America/Chicago',theme:'dark',style:'1',locale:'en',allow_symbol_change:true,hide_top_toolbar:false,hide_side_toolbar:false,details:true,watchlist,calendar:false,withdateranges:true,save_image:true});
    script.onerror=()=>{widget.textContent='TradingView could not load. Check connectivity or use the TradingView link below.';};
    container.append(widget,credit,script);mount.append(container);
  }
})();
