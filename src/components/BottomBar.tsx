import { useState, useEffect } from 'react';
import { Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BottomBar() {
  const toggleConsole = () => {
    setIsConsoleOpen(prev => !prev);
  };

  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    `[${new Date().toISOString()}] SELECT * FROM users;`,
    `[${new Date().toISOString()}] INSERT INTO orders (id, user_id, total) VALUES (1, 101, 250.50);`,
    `[${new Date().toISOString()}] UPDATE products SET price = 19.99 WHERE id = 5;`,
    `[${new Date().toISOString()}] DELETE FROM sessions WHERE expired = true;`,
    `[${new Date().toISOString()}] SELECT COUNT(*) FROM logs WHERE level = 'error';`,
    `[${new Date().toISOString()}] CREATE TABLE customers (id INT, name VARCHAR(255), email VARCHAR(255));`,
    `[${new Date().toISOString()}] DROP TABLE temp_data;`,
    `[${new Date().toISOString()}] ALTER TABLE orders ADD COLUMN discount FLOAT;`,
    `[${new Date().toISOString()}] SELECT * FROM employees WHERE department = 'HR';`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE total > 100;`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE stock < 10;`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE last_login > '2023-01-01';`,
    `[${new Date().toISOString()}] SELECT * FROM payments WHERE status = 'completed';`,
    `[${new Date().toISOString()}] SELECT * FROM logs WHERE timestamp > NOW() - INTERVAL 1 DAY;`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE user_id = 101;`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE category = 'electronics';`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE email LIKE '%@gmail.com';`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE created_at BETWEEN '2023-01-01' AND '2023-12-31';`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE price BETWEEN 10 AND 50;`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE name LIKE 'John%';`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE status = 'shipped';`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE name LIKE '%phone%';`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE role = 'admin';`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE payment_method = 'credit_card';`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE brand = 'Apple';`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE country = 'USA';`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE shipping_address LIKE '%New York%';`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE rating > 4.5;`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE age > 30;`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE quantity > 5;`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE color = 'red';`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE subscription = 'premium';`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE delivery_date < NOW();`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE weight < 1.5;`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE phone IS NOT NULL;`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE tracking_number IS NOT NULL;`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE dimensions IS NOT NULL;`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE created_at > '2022-01-01';`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE updated_at > '2023-01-01';`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE sku IS NOT NULL;`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE status = 'active';`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE refunded = true;`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE discontinued = false;`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE verified = true;`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE coupon_code IS NOT NULL;`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE featured = true;`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE referred_by IS NOT NULL;`,
    `[${new Date().toISOString()}] SELECT * FROM orders WHERE gift_wrapped = true;`,
    `[${new Date().toISOString()}] SELECT * FROM products WHERE on_sale = true;`,
    `[${new Date().toISOString()}] SELECT * FROM users WHERE loyalty_points > 100;`
  ]);
  const [isConsoleWindowOpen, setIsConsoleWindowOpen] = useState(false);
  const [serverStats, setServerStats] = useState({
    uptime: '12:34:56',
    connections: 10,
    queries: 12345,
    server: 'MySQL 8.0.28',
    host: '127.0.0.1',
    port: 3306
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setServerStats(prev => ({
        ...prev,
        queries: prev.queries + Math.floor(Math.random() * 10)
      }));
      setConsoleLogs(prev => [...prev]);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {isConsoleWindowOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-background p-4 rounded-md shadow-lg w-3/4 h-3/4 overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Console</h2>
              <Button className="text-sm text-red-500 hover:underline" onClick={() => setIsConsoleWindowOpen(false)}>
                Close
              </Button>
            </div>
            <div className="h-full overflow-y-auto">
              <pre className="text-muted-foreground whitespace-pre pl-2 pr-4">
                {consoleLogs.map((log, index) => (
                  <div key={index} className="text-left">
                    <code>{highlightSQL(log)}</code>
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>
      )}
      <div className={`bg-background text-xs text-left cursor-pointer py-2 px-2 border-t ${isConsoleOpen ? 'h-40' : 'h-8'} transition-all duration-300`} onClick={toggleConsole}>
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          <span>Console</span>
        </div>
        {isConsoleOpen && (
          <div className="mt-2 h-full overflow-y-auto pb-4 overscroll-contain">
            <pre className="text-muted-foreground whitespace-pre pl-2 pr-4 scroll-padding-bottom-4">
              {consoleLogs.map((log, index) => (
                <div key={index} className="text-left">
                  <code>{highlightSQL(log)}</code>
                </div>
              ))}
            </pre>
          </div>
        )}
      </div>
      <div className={`bg-background text-xs text-left py-1 px-3 border-t border-t-muted-foreground flex justify-between items-center`}>
        <div className="flex gap-4 divide-x divide-muted-foreground">
          <span className="pr-4">Server: {serverStats.server}</span>
          <span className="pl-4 pr-4">Host: {serverStats.host}</span>
          <span className="pl-4 pr-4">Port: {serverStats.port}</span>
          <span className="pl-4 pr-4">Uptime: {serverStats.uptime}</span>
          <span className="pl-4 pr-4">Connections: {serverStats.connections}</span>
          <span className="pl-4">Queries: {serverStats.queries}</span>
        </div>
      </div>
    </>
  );
}

function highlightSQL(sql: string): React.ReactNode {
  const keywords = ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'BETWEEN', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'LIKE', 'IN', 'AS', 'JOIN', 'ON', 'ORDER', 'BY', 'GROUP', 'HAVING', 'DISTINCT', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'END'];
  const regex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');

  return sql.split(/(\s+)/).map((part, index) => {
    if (regex.test(part)) {
      return (
        <span key={index} className="text-blue-500 font-bold">
          {part.toUpperCase()}
        </span>
      );
    } else if (/^['"].*['"]$/.test(part)) {
      return (
        <span key={index} className="text-green-500">
          {part}
        </span>
      );
    } else if (/^\d+$/.test(part)) {
      return (
        <span key={index} className="text-purple-500">
          {part}
        </span>
      );
    }
    return part;
  });
}
