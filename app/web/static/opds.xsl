<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" 
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
    xmlns:atom="http://www.w3.org/2005/Atom"
    xmlns:opds="http://opds-spec.org/2010/catalog">
  
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  
  <xsl:template match="/">
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title><xsl:value-of select="atom:feed/atom:title"/></title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #121212;
            color: #e0e0e0;
            line-height: 1.6;
            padding: 20px;
          }
          .container { max-width: 900px; margin: 0 auto; }
          header {
            background: #1e1e1e;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          h1 { color: #90caf9; font-size: 1.8em; margin-bottom: 10px; }
          .nav-links { display: flex; gap: 15px; flex-wrap: wrap; margin-top: 15px; }
          .nav-links a {
            color: #90caf9;
            text-decoration: none;
            padding: 8px 16px;
            background: #2d2d2d;
            border-radius: 4px;
          }
          .nav-links a:hover { background: #3d3d3d; }
          .entry {
            background: #1e1e1e;
            padding: 15px;
            margin-bottom: 15px;
            border-radius: 8px;
            display: flex;
            gap: 15px;
          }
          .entry-cover {
            width: 80px;
            height: 120px;
            background: #2d2d2d;
            border-radius: 4px;
            flex-shrink: 0;
            object-fit: cover;
          }
          .entry-content { flex: 1; }
          .entry-title {
            color: #fff;
            font-size: 1.1em;
            margin-bottom: 5px;
          }
          .entry-author { color: #90caf9; font-size: 0.9em; margin-bottom: 8px; }
          .entry-summary { color: #888; font-size: 0.9em; margin-bottom: 10px; }
          .entry-links { display: flex; gap: 10px; flex-wrap: wrap; }
          .entry-links a {
            color: #fff;
            text-decoration: none;
            padding: 6px 12px;
            background: #1976d2;
            border-radius: 4px;
            font-size: 0.85em;
          }
          .entry-links a:hover { background: #1565c0; }
          .pagination {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin-top: 20px;
          }
          .pagination a {
            color: #90caf9;
            text-decoration: none;
            padding: 10px 20px;
            background: #2d2d2d;
            border-radius: 4px;
          }
          .info { color: #888; text-align: center; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <header>
            <h1><xsl:value-of select="atom:feed/atom:title"/></h1>
            <div class="nav-links">
              <a href="/opds">首页</a>
              <a href="/opds/recent">最新书籍</a>
              <a href="/opds/authors">作者索引</a>
            </div>
          </header>
          
          <xsl:for-each select="atom:feed/atom:entry">
            <div class="entry">
              <xsl:variable name="coverUrl" select="atom:link[@rel='http://opds-spec.org/image']/@href"/>
              <xsl:if test="$coverUrl">
                <img class="entry-cover" src="{$coverUrl}" alt="封面"/>
              </xsl:if>
              <div class="entry-content">
                <div class="entry-title"><xsl:value-of select="atom:title"/></div>
                <xsl:if test="atom:author/atom:name">
                  <div class="entry-author">作者: <xsl:value-of select="atom:author/atom:name"/></div>
                </xsl:if>
                <xsl:if test="atom:content">
                  <div class="entry-summary"><xsl:value-of select="atom:content"/></div>
                </xsl:if>
                <xsl:if test="atom:summary">
                  <div class="entry-summary"><xsl:value-of select="atom:summary"/></div>
                </xsl:if>
                <div class="entry-links">
                  <xsl:for-each select="atom:link[@rel='subsection' or @rel='http://opds-spec.org/acquisition']">
                    <a href="{@href}">
                      <xsl:choose>
                        <xsl:when test="@rel='http://opds-spec.org/acquisition'">下载</xsl:when>
                        <xsl:otherwise>查看</xsl:otherwise>
                      </xsl:choose>
                    </a>
                  </xsl:for-each>
                </div>
              </div>
            </div>
          </xsl:for-each>
          
          <div class="pagination">
            <xsl:if test="atom:feed/atom:link[@rel='previous']">
              <a href="{atom:feed/atom:link[@rel='previous']/@href}">上一页</a>
            </xsl:if>
            <xsl:if test="atom:feed/atom:link[@rel='next']">
              <a href="{atom:feed/atom:link[@rel='next']/@href}">下一页</a>
            </xsl:if>
          </div>
          
          <div class="info">
            <p>此页面为 OPDS 目录，推荐使用 Moon+ Reader、Librera 等阅读器访问</p>
          </div>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
