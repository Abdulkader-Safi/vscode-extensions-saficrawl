import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { FULL_SEO_PAGE, ROBOTS_TXT, SITEMAP_INDEX_XML, SITEMAP_XML, THIN_PAGE } from "./fixtures";

export interface FixtureServer {
  server: Server;
  port: number;
  base: string;
  close: () => Promise<void>;
}

export function startFixtureServer(): Promise<FixtureServer> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = req.url ?? "/";
      const base = `http://localhost:${(server.address() as AddressInfo).port}`;

      const send = (status: number, body: string, type = "text/html; charset=utf-8") => {
        res.writeHead(status, { "content-type": type });
        res.end(body);
      };

      if (url === "/robots.txt") {return send(200, ROBOTS_TXT.replaceAll("BASE", base.replace(/^https?:\/\//, "")), "text/plain");}
      if (url === "/sitemap.xml") {return send(200, SITEMAP_INDEX_XML.replaceAll("BASE", base.replace(/^https?:\/\//, "")), "application/xml");}
      if (url === "/sitemap-a.xml") {return send(200, SITEMAP_XML.replaceAll("BASE", base.replace(/^https?:\/\//, "")), "application/xml");}
      if (url === "/thin") {return send(200, THIN_PAGE);}
      if (url === "/a" || url === "/b" || url === "/about" || url === "/docs" || url === "/privacy") {return send(200, FULL_SEO_PAGE);}
      if (url === "/" || url === "/self") {return send(200, FULL_SEO_PAGE);}
      if (url === "/redirect") {
        res.writeHead(302, { location: "/" });
        return res.end();
      }
      send(404, "not found", "text/plain");
    });

    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        server,
        port,
        base: `http://localhost:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
