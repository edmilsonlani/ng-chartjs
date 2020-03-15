import { StoreService } from './store.service';
import {
  OnDestroy,
  OnInit,
  OnChanges,
  EventEmitter,
  ElementRef,
  Input,
  Output,
  SimpleChanges,
  Directive
} from '@angular/core';
import { Chart } from 'chart.js';

import { NgChartjsService } from './ng-chartjs.service';
import { getColors } from './colors';
/* tslint:disable-next-line */
@Directive({ selector: 'canvas[ngChartjs]', exportAs: 'ng-chart-js' })
export class NgChartjsDirective implements OnDestroy, OnChanges, OnInit {

  // 图表的点集，它应该是数组<number []>仅用于线，条和雷达，否则数字[];
  @Input() data: number[] | any[];
  // 相当于chart.js内 data: {datasets: [{...}]}
  @Input() datasets: any[];
  // x轴标签。这对图表来说是必要的：线，条和雷达。并且只是图表的标签（悬停）：polarArea，pie和doughnut
  @Input() labels: any[] = [];
  // 相当于chart.js的option
  @Input() options: any = {};
  // 内联插件属性
  @Input() inlinePlugins: any[];
  // chartType line, bar, radar, pie, polarArea, doughnut
  @Input() chartType: string;
  // 数据颜色，如果没有指定，将使用默认和|或随机颜色
  @Input() colors: any[];
  // 是否显示图例
  @Input() legend: boolean;

  @Input() adding: { labels: any[], data: any[][] };
  @Input() removing: { orientation: string };  // orientation is 'oldest' or 'latest
  @Input() resetOption: any;

  // 鼠标点击图表所有的区域
  @Output() chartClick: EventEmitter<any> = new EventEmitter();
  // 鼠标悬浮在标签或者活跃的点上面时
  @Output() chartHover: EventEmitter<any> = new EventEmitter();

  private ctx: any;
  private chart_: any;
  private initFlag = false;
  private hasChanges = false;

  private element: ElementRef;

  public constructor(element: ElementRef,
    private ngChartjsService: NgChartjsService,
    private storeService: StoreService) {
    this.element = element;   // 获取指令所在canvas元素
  }

  ngOnInit() {
    this.ctx = this.element.nativeElement.getContext('2d'); // 获取元素的ctx
    this.initFlag = true; // 是否初始化了的标志

    if (this.data || this.datasets) { // 判断data和datasets有一个有数据就刷新
      this.refresh();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // TODO: 插件变化刷新，开放刷新按钮
    if (this.initFlag) {
      // Check if the changes are in the data or datasets
      if (changes.hasOwnProperty('data') || changes.hasOwnProperty('datasets')) {
        if (changes.data) {
          this.updateChartData(changes.data.currentValue);
        } else {
          this.updateChartData(changes.datasets.currentValue);
        }
        this.hasChanges = true;
      }

      if (changes.hasOwnProperty('labels')) {
        this.chart_.data.labels = changes.labels.currentValue;
        this.hasChanges = true;
      }

      if (changes.hasOwnProperty('legend')) {
        if (changes.legend.currentValue !== changes.legend.previousValue) {
          this.chart_.options.legend.display = changes.legend.currentValue;
          this.hasChanges = true;
        }
      }

      if (changes.hasOwnProperty('adding')) {
        this.addData(changes.adding.currentValue.labels, changes.adding.currentValue.data);
        this.hasChanges = true;
      }

      if (changes.hasOwnProperty('removing')) {
        if (changes.removing.currentValue.orientation === 'oldest' || changes.removing.currentValue.orientation === 'latest') {
          this.removeData(changes.removing.currentValue.orientation);
          this.hasChanges = true;
        }
      }

      if (changes.hasOwnProperty('chartType')) {
        this.refresh();
      }

      if (changes.hasOwnProperty('resetOption')) {
        Object.assign(this.chart_.options, changes.resetOption.currentValue);
        this.hasChanges = true;
      }

      if (this.hasChanges) {
        this.chart_.update();
        this.hasChanges = false;
      }
    }
  }

  ngOnDestroy() {
    if (this.chart_) {
      this.chart_.destroy();
      this.chart_ = void 0;

      if (this.element.nativeElement.hasAttribute('id')) {
        this.storeService.removeChart(this.element.nativeElement.id);  // delete chart instance.
      }
    }
  }

  get chart() { return this.chart_; }

  addData(labels: any[], data: any[][]) {
    if (labels.length === 0 || data.length === 0) {
      return;
    }
    // update labels
    labels.forEach((label) => { this.chart_.data.labels.push(label); });

    this.chart_.data.datasets.forEach((dataset, index) => {
      if (data[index]) {
        for (let i = 0; i < data[index].length; i++) {
          dataset.data.push(data[index][i]);
        }
      } else {
        console.log('The added data does not match the original data');
        return;
      }
    });
  }
  // direction is 'ildest' or 'latest'
  removeData(direction: string) {
    // fix: support to oldest feature
    if (direction === 'latest') {
      this.chart_.data.labels.pop();
      this.chart_.data.datasets.forEach((dataset: any) => {
        dataset.data.pop();
      });
    } else if (direction === 'oldest') {
      this.chart_.data.labels.shift();
      this.chart_.data.datasets.forEach((dataset: any) => {
        dataset.data.shift();
      });
    }
  }

  private refresh(): any {
    this.ngOnDestroy();
    this.chart_ = this.getChartBuilder(this.ctx/*, data, this.options*/);
    if (this.element.nativeElement.hasAttribute('id')) {
      this.storeService.addChart(this.element.nativeElement.id, this.chart_);
    }
  }

  private updateChartData(newDataValues: number[] | any[]): void {
    if (Array.isArray(newDataValues[0].data)) {
      this.chart_.data.datasets.forEach((dataset: any, i: number) => {
        dataset.data = newDataValues[i].data;

        if (newDataValues[i].label) {
          dataset.label = newDataValues[i].label;
        }
      });
    } else {
      this.chart_.data.datasets[0].data = newDataValues;
    }
  }

  private getChartBuilder(ctx: any/*, data:Array<any>, options:any*/): any {
    const datasets: any = this.getDatasets();

    const options: any = Object.assign({}, this.options); // 深复制options
    if (this.legend === false) {  // 设置options的legend TODO: 后续这个属性去除，直接在options内设置
      options.legend = { display: false };
    }
    // hock for onHover and onClick events
    options.hover = options.hover || {};
    if (!options.hover.onHover) {
      options.hover.onHover = (event: any, active: any[]) => {
        if (active && !active.length) {
          return;
        }
        this.chartHover.emit({ event, active });
      };
    }

    if (!options.onClick) {
      options.onClick = (event: any, active: any[]) => {
        this.chartClick.emit({ event, active });
      };
    }

    const opts = {
      type: this.chartType,
      data: {
        labels: this.labels,
        datasets: datasets   // TODO: 后续更改这个属性名字，否则警告
      },
      options: options,   // TODO: 后续更改这个属性名字，否则警告
      plugins: this.inlinePlugins
    };

    return new Chart(ctx, opts);
  }

  // 获取 chart.js的datasets数据
  private getDatasets(): any {
    let datasets: any = void 0;
    // in case if datasets is not provided, but data is present
    if (!this.datasets || !this.datasets.length && (this.data && this.data.length)) {
      if (Array.isArray(this.data[0])) {
        datasets = (this.data as number[][]).map((data: number[], index: number) => {
          return { data, label: this.labels[index] || `Label ${index}` };
        });
      } else {
        datasets = [{ data: this.data, label: `Label 0` }];
      }
    }

    if (this.datasets && this.datasets.length || (datasets && datasets.length)) {
      // fix elm type, pre type is number
      datasets = (this.datasets || datasets).map((elm: any, index: number) => {
        const newElm: any = Object.assign({}, elm);
        if (this.colors && this.colors.length) {
          Object.assign(newElm, this.colors[index]);
        } else {
          Object.assign(newElm, getColors(this.chartType, index, newElm.data.length));
        }
        return newElm;
      });
    }

    if (!datasets) {
      throw new Error(`ng-chartjs configuration error,
      data or datasets field are required to render char ${this.chartType}`);
    }

    return datasets;
  }
}
